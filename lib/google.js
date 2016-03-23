'use strict';

/* global JuttleAdapterAPI */
let _ = require('underscore');
let logger = JuttleAdapterAPI.getLogger('google-analytics');
let JuttleMoment = JuttleAdapterAPI.types.JuttleMoment;
let Promise = require('bluebird');
let google = require('googleapis');
let analytics = google.analytics('v3');

let auth, authorized, accountId;

function init(config) {
    auth = new google.auth.JWT(
        config.service_account.client_email,
        null,
        config.service_account.private_key,
        ['https://www.googleapis.com/auth/analytics'],
        null
    );
    Promise.promisifyAll(auth);
    Promise.promisifyAll(analytics.data.ga);
    Promise.promisifyAll(analytics.management.accounts);
    Promise.promisifyAll(analytics.management.webproperties);
    Promise.promisifyAll(analytics.management.profiles);
}

function authorize() {
    if (! authorized) {
        authorized = auth.authorizeAsync()
        .then(() => {
            return analytics.management.accounts.listAsync({auth: auth});
        })
        .then((accounts) => {
            accountId = accounts.items[0].id;
        });
    }
    return authorized;
}

// given 1 or more strings, prefix each with "ga:" and return a comma separated
// string.
function gaString(vals) {
    if (! (vals instanceof Array)) {
        vals = [vals];
    }
    return vals.map((val) => { return 'ga:' + val; }).join(', ');
}

function toJuttle(results, extras) {
    let points = [];
    let columns = results.columnHeaders;
    let data = results.rows;

    if (!data) {
        return [];
    }

    for (let row = 0; row < data.length; ++row) {
        let pt = extras ? _.clone(extras) : {};
        for (let col = 0; col < columns.length; ++col) {
            let spec = columns[col];
            let name = spec.name.substr(3);
            let value = data[row][col];

            if (spec.dataType === 'INTEGER') {
                value = parseInt(value, 10);
            } else if (spec.dataType === 'TIME') {
                value = parseFloat(value);
            }
            switch (name) {
                case 'year':
                    pt.time = JuttleMoment.parse(value, 'YYYY');
                    break;

                case 'month':
                    pt.time = pt.time.add(JuttleMoment.duration(value - 1, 'M'));
                    break;

                case 'week':
                    pt.time = pt.time.add(JuttleMoment.duration(value - 1, 'w'));
                    break;

                case 'date':
                    pt.time = JuttleMoment.parse(value, 'YYYYMMDD');
                    break;

                case 'dateHour':
                    pt.time = JuttleMoment.parse(value, 'YYYYMMDDHH');
                    break;

                case 'minute':
                    pt.time = pt.time.add(JuttleMoment.duration(value, 'm'));
                    break;

                default:
                    pt[name] = value;
            }
        }

        points.push(pt);
    }

    return points;
}

// Get all accessible properties for the account
function getProperties() {
    return analytics.management.webproperties.listAsync({
        auth: auth,
        accountId: accountId
    })
    .then((properties) => {
        logger.debug('got properties', JSON.stringify(properties, null, 4));
        return _.map(properties.items, (property) => {
            return _.pick(property, 'id', 'name');
        });
    });
}

// Get all views for the given property
function getViews(property, options) {
    logger.debug('getting views for', property);
    return analytics.management.profiles.listAsync({
        auth: auth,
        accountId: accountId,
        webPropertyId: property.id
    })
    .then((profiles) => {
        // If we're not grouping by view, then only include the default view
        // named "All Web Site Data". Otherwise the counts can potentially be
        // duplicated.
        if (options.metagroup !== 'view') {
            profiles.items = _.where(profiles.items, {name: 'All Web Site Data'});
        }
        return _.map(profiles.items, (profile) => {
            return {
                webPropertyId: property.id,
                webProperty: property.name,
                viewId: profile.id,
                view: profile.name
            };
        });
    });
}

// Return an object containing all properties / views for the given user.
function getAllViews(options) {
    return getProperties()
    .then((properties) => {
        return Promise.map(properties, (webProperty) => {
            if (options.webProperty &&
                options.webProperty !== webProperty.name &&
                options.webProperty !== webProperty.id)
            {
                return [];
            }

            return getViews(webProperty, options);
        });
    })
    .then((views) => {
        return _.flatten(views);
    });
}

function getData(view, options) {
    let query = {
        ids: gaString(view.viewId),
        metrics: gaString(options.metrics),
        dimensions: gaString(options.dimensions),
        'start-date': options.startDate,
        'end-date': options.endDate,
        'start-index': 1,
        'max-results': options.fetchSize || 1000
    };
    logger.debug('query', options, query);
    query.auth = auth;

    let points = [];
    let fetches = 0;
    function fetch() {
        fetches++;
        return analytics.data.ga.getAsync(query)
        .then((results) => {
            var resultStr = JSON.stringify(results, null, 4);
            if (resultStr.length > 2000) {
                resultStr = resultStr.substr(0, 2000) + '...';
            }
            logger.debug('query returned', resultStr);
            points = points.concat(toJuttle(results, options.metagroup ? view : null));

            if (points.length === results.totalResults) {
                return {
                    points: points,
                    fetches: fetches
                };
            } else {
                query['start-index'] += query['max-results'];
                return fetch();
            }
        });
    }
    return fetch();
}

function query(options) {
    return authorize()
    .then(() => {
        // If the user supplies a viewId, then we can query with that. Otherwise
        // we need to get all the views so we can filter by either the property
        // or the view name.
        if (options.viewId) {
            return [{viewId: options.viewId}];
        } else {
            return getAllViews(options);
        }
    })
    .then((views) => {
        // If there are no specified metrics, then just return the metadata
        // about the properties / views.
        if (options.metrics.length === 0) {
            return {points: views, fetches: 0};
        } else {
            return Promise.map(views, (view) => {
                return getData(view, options);
            })
            .then((results) => {
                return _.reduce(results, (memo, result) => {
                    memo.points = memo.points.concat(result.points);
                    memo.fetches += result.fetches;
                    return memo;
                }, {points: [], fetches: 0});
            });
        }
    })
    .then((results) => {
        if (results.points.length !== 0 && results.points[0].time) {
            results.points.sort((a, b) => {
                return JuttleMoment.compare(a.time, b.time);
            });
        }
        return results;
    });
}

module.exports = {
    init,
    query
};
