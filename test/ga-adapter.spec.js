'use strict';

let _ = require('underscore');
let path = require('path');
let expect = require('chai').expect;
let Promise = require('bluebird');

let read_config = require('juttle/lib/config/read-config');
let juttle_test_utils = require('juttle/test/runtime/specs/juttle-test-utils');
let expectToFail = juttle_test_utils.expectToFail;
let checkJuttle = juttle_test_utils.checkJuttle;

juttle_test_utils.withAdapterAPI(function() {
    let views = [];
    let viewId = null;

    function badJuttle(juttle, message) {
        return expectToFail(checkJuttle({program: juttle}), message);
    }

    before(function() {
        this.timeout(30000);
        // Try to read from the config file first. If not present,
        // look in the environment variable JUTTLE_GA_CONFIG. In
        // TravisCI, the config is provided via the environment to
        // avoid putting sensitive information like ids/auth tokens in
        // source files.
        let config = read_config();
        let ga_config;

        if (_.has(config, 'adapters') &&
            _.has(config.adapters, 'ga')) {
            ga_config = config.adapters.ga;
        } else {
            if (! _.has(process.env, 'JUTTLE_GA_CONFIG') ||
                process.env.JUTTLE_GA_CONFIG === '') {
                throw new Error('To run this test, you must provide the adapter config via the environment as JUTTLE_GA_CONFIG.');
            }
            ga_config = JSON.parse(process.env.JUTTLE_GA_CONFIG);
        }

        ga_config.path = path.resolve(__dirname, '..');

        juttle_test_utils.configureAdapter({
            ga: ga_config
        });

        // Read all the properties and views once so we can use them later.
        return checkJuttle({
            program: 'read ga | reduce by webProperty, webPropertyId, view, viewId'
        })
        .then((results) => {
            expect(results.errors).deep.equal([]);
            expect(results.warnings).deep.equal([]);
            views = results.sinks.table;
            viewId = views[0].viewId;
        });
    });

    beforeEach(() => {
        // Add a pause between test cases to help avoid rate limits
        return Promise.delay(1000);
    });

    describe('read ga', function() {
        this.timeout(30000);

        // These actually got fetched in the before() since they're needed for
        // several of the tests
        it('can list the properties and views', () => {
            expect(views.length).greaterThan(0);
            expect(views[0].viewId).is.defined;
        });

        it('can query a single metric from one view', () => {
            return checkJuttle({
                program: `read ga -viewId ${viewId} -last :week: | reduce sum(users)`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table[0].sum).greaterThan(0);
            });
        });

        it('can query a single metric from one property', () => {
            return checkJuttle({
                program: `read ga -webProperty "${views[0].webProperty}" -last :week: | reduce sum(users)`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table[0].sum).greaterThan(0);
            });
        });

        it('can query a single metric into a variable', () => {
            return checkJuttle({
                program: `const x="foo"; read ga -viewId ${viewId} -last :week: | reduce *x=sum(users)`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table[0].foo).greaterThan(0);
            });
        });

        it('can query a single metric into a * field', () => {
            return checkJuttle({
                program: `read ga -viewId ${viewId} -last :week: | reduce *"foo"=sum(users)`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table[0].foo).greaterThan(0);
            });
        });

        it('can query a single metric by a dimension', () => {
            return checkJuttle({
                program: `read ga -viewId ${viewId} -last :week: | reduce sum(users) by userType`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table.length).equals(2);
                expect(results.sinks.table[0].sum).greaterThan(0);
                expect(results.sinks.table[1].sum).greaterThan(0);
            });
        });

        it('can query a single metric across views', () => {
            return checkJuttle({
                program: 'read ga -last :week: | reduce sum(users) by webProperty, view'
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table.length).equals(views.length);
            });
        });

        it('can query a single metric across properties', () => {
            return checkJuttle({
                program: 'read ga -last :week: | reduce sum(users) by webProperty'
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table.length).greaterThan(1);
            });
        });

        it('can reduce a second time', () => {
            return checkJuttle({
                program: 'read ga -last :week: | reduce sum(users) by webProperty, view | reduce count()'
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table[0].count).equals(views.length);
            });
        });

        it('can query a time metric', () => {
            return checkJuttle({
                program: `read ga -viewId ${viewId} -last :week: | reduce sum(avgTimeOnSite)`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table[0].sum).greaterThan(1.0);
            });
        });

        it('can query a metric with no data', () => {
            return checkJuttle({
                program: `read ga -viewId ${viewId} | reduce sum(transactions)`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table[0].sum).to.equal(0);
            });
        });
    });

    describe('read ga reduce intervals', function() {
        this.timeout(30000);

        let intervals = 'mhdwMy';
        for (let i = 0; i < intervals.length; ++i) {
            let interval = `:1${intervals[i]}:`;

            it(`can reduce -every ${interval}`, () => {
                return checkJuttle({
                    program: `read ga -viewId ${viewId} -last :day: | reduce -every ${interval} sum(users)`
                })
                .then((results) => {
                    expect(results.errors).deep.equal([]);
                    expect(results.warnings).deep.equal([]);
                    expect(results.sinks.table.length).greaterThan(0);
                });
            });
        }

        it(`can reduce -every interval across multiple properties`, () => {
            return checkJuttle({
                program: `read ga -last :week: | reduce -every :day: sum(users) by webProperty`
            })
            .then((results) => {
                expect(results.errors).deep.equal([]);
                expect(results.warnings).deep.equal([]);
                expect(results.sinks.table.length).greaterThan(0);
            });
        });

        it('fails with an invalid -every interval', () => {
            return badJuttle(
                'read ga | reduce -every :10 days: sum(users)',
                'read ga does not support reduce with interval other than 1 minute, hour, day, week, month or year'
            );
        });
    });

    describe('read ga errors', function() {
        this.timeout(30000);

        it('fails without reduce', () => {
            return badJuttle(
                'read ga',
                'read ga does not support read without reduce'
            );
        });

        it('fails with a filter ', () => {
            return badJuttle(
                'read ga foo=123',
                'filtering is not supported by read ga.'
            );
        });

        it('fails with reduce -on', () => {
            return badJuttle(
                'read ga | reduce -every :1d: -on :now: sum(users)',
                'read ga does not support reduce with options every,on'
            );
        });

        it('fails with reduce into time', () => {
            return badJuttle(
                'read ga | reduce time=sum(users)',
                'read ga does not support reduce on time'
            );
        });

        it('fails with reduce by time', () => {
            return badJuttle(
                'read ga | reduce sum(users) by time',
                'read ga does not support reduce group by time'
            );
        });

        it('fails with reduce by date', () => {
            return badJuttle(
                'read ga | reduce sum(users) by date',
                'read ga does not support reduce group by date'
            );
        });

        it('fails with reduce sum(1))', () => {
            return badJuttle(
                'read ga | reduce sum(1)',
                'read ga does not support reduce other than sum(field)'
            );
        });

        it('fails with reduce count()', () => {
            return badJuttle(
                'read ga | reduce count()',
                'read ga does not support reduce other than sum(field)'
            );
        });

        it('fails with reduce percentile(users, 10)', () => {
            return badJuttle(
                'read ga | reduce percentile(users, 10)',
                'read ga does not support reduce other than sum(field)'
            );
        });

        it('fails with reduce avg(1)', () => {
            return badJuttle(
                'read ga | reduce avg(1)',
                'read ga does not support reduce other than sum(field)'
            );
        });

        it('fails with reduce x="y"', () => {
            return badJuttle(
                'read ga | reduce sum(users), x="y"',
                'read ga does not support reduce other than sum(field)'
            );
        });

        it('fails with reduce and no metric', () => {
            return badJuttle(
                'read ga | reduce by userType',
                'read ga does not support reduce by userType without a metric'
            );
        });

        it('fails with -viewId and reduce by viewId', () => {
            return badJuttle(
                `read ga -viewId ${viewId}| reduce by viewId`,
                'read ga does not support -viewId with reduce group by viewId'
            );
        });

    });
});
