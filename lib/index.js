'use strict';

let google = require('./google');

function GoogleAnalyticsAdapter(config) {
    google.init(config);

    return {
        name: 'googleanalytics',
        read: require('./read'),
        optimizer: require('./optimize')
    };
}

module.exports = GoogleAnalyticsAdapter;
