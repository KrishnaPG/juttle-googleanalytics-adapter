'use strict';

/* global JuttleAdapterAPI */
let AdapterRead = JuttleAdapterAPI.AdapterRead;
let JuttleMoment = JuttleAdapterAPI.types.JuttleMoment;
let errors = JuttleAdapterAPI.errors;
let google = require('./google');

class ReadGoogleAnalytics extends AdapterRead {
    constructor(options, params) {
        super(options, params);

        if (params.filter_ast) {
            throw errors.compileError('ADAPTER-UNSUPPORTED-FILTER', {
                proc: 'read ga',
                filter: 'filtering',
                location: params.filter_ast.location
            });
        }

        // to provide better error messages, the optimizer includes information
        // as to the invalid invocation in the optimization_info
        if (params.optimization_info.invalid) {
            // XXX this would be good to move into the core juttle errors
            throw new errors.CompileError(`read ga does not support ${params.optimization_info.invalid}`,
                'ADAPTER-UNSUPPORTED-FEATURE',
                {
                    location: params.optimization_info.location
                }
            );
        }

        if (params.optimization_info.type !== 'reduce') {
            throw new errors.CompileError('read ga does not support read without reduce',
                'ADAPTER-INVALID-READ',
                {
                    location: params.location
                }
            );
        }

        this.metrics = params.optimization_info.metrics;
        this.dimensions = params.optimization_info.dimensions;
        this.metagroup = params.optimization_info.metagroup;
        this.webProperty = options.webProperty;
        this.viewId = options.viewId;
        this.fetchSize = options.fetchSize;
    }

    static allowedOptions() {
        return AdapterRead.commonOptions().concat(['viewId', 'webProperty', 'fetchSize']);
    }

    periodicLiveRead() { return true; }

    defaultTimeOptions() {
        return {
            from: this.params.now,
            to: this.params.now
        };
    }

    read(from, to, limit, state) {
        let startDate = JuttleMoment.format(from, 'YYYY-MM-DD');
        let endDate = JuttleMoment.format(to, 'YYYY-MM-DD');

        return google.query({
            startDate: startDate,
            endDate: endDate,
            fetchSize: this.fetchSize,
            metrics: this.metrics,
            dimensions: this.dimensions,
            metagroup: this.metagroup,
            viewId: this.options.viewId,
            webProperty: this.options.webProperty
        })
        .then((results) => {
            this.fetches = results.fetches;
            return {
                points: results.points,
                eof: true
            };
        });
    }
}

module.exports = ReadGoogleAnalytics;
