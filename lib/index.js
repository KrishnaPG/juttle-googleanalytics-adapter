'use strict';

let google = require('./google');

function GoogleAnalyticsAdapter(config) {
    google.init(config);

    return {
        name: 'ga',
        read: require('./read'),
        optimizer: require('./optimize')
    };
}

module.exports = GoogleAnalyticsAdapter;
