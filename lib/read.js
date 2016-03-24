'use strict';

/* global JuttleAdapterAPI */
let AdapterRead = JuttleAdapterAPI.AdapterRead;
let JuttleMoment = JuttleAdapterAPI.types.JuttleMoment;
let errors = JuttleAdapterAPI.errors;
let google = require('./google');

function isRoundDay(m) {
    return m.quantize(JuttleMoment.duration(1, 'd')).eq(m);
}

class ReadGoogleAnalytics extends AdapterRead {
    constructor(options, params) {
        super(options, params);

        if (params.filter_ast) {
            throw errors.compileError('ADAPTER-UNSUPPORTED-FILTER', {
                proc: 'read googleanalytics',
                filter: 'filtering',
                location: params.filter_ast.location
            });
        }

        // to provide better error messages, the optimizer includes information
        // as to the invalid invocation in the optimization_info
        if (params.optimization_info.invalid) {
            // XXX this would be good to move into the core juttle errors
            throw new errors.CompileError(`read googleanalytics does not support ${params.optimization_info.invalid}`,
                'ADAPTER-UNSUPPORTED-FEATURE',
                {
                    location: params.optimization_info.location
                }
            );
        }

        if (params.optimization_info.type !== 'reduce') {
            throw new errors.CompileError('read googleanalytics does not support read without reduce',
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

        if (this.options.from && !isRoundDay(this.options.from)) {
            throw errors.compileError('ADAPTER-UNSUPPORTED-TIME-OPTION', {
                option: '-from',
                message: 'must be aligned to a whole day'
            });
        }

        this.now = params.now;
        if (this.options.to && !isRoundDay(this.options.to) && !this.options.to.eq(params.now)) {
            throw errors.compileError('ADAPTER-UNSUPPORTED-TIME-OPTION', {
                option: '-to',
                message: 'must be aligned to a whole day or :now:'
            });
        }
    }

    static allowedOptions() {
        return AdapterRead.commonOptions().concat(['viewId', 'webProperty', 'fetchSize']);
    }

    periodicLiveRead() { return true; }

    defaultTimeOptions() {
        let today = JuttleMoment.quantize(this.params.now, JuttleMoment.duration(1, 'd'));
        return {
            from: today.subtract(JuttleMoment.duration(1, 'w')),
            to: today
        };
    }

    read(from, to, limit, state) {
        let startDate = JuttleMoment.format(from, 'YYYY-MM-DD');
        let endDate;

        // The only supported values for the end date are :now: or a whole day.
        // Since the API supports startDate and endDate filters that are
        // inclusive, include the to day if it includes the partial current day
        // (i.e. `-to :now`), otherwise subtract a day to compute the endDate.
        if (to.eq(this.now)) {
            endDate = JuttleMoment.format(to, 'YYYY-MM-DD');
        } else {
            endDate = JuttleMoment.format(to.subtract(JuttleMoment.duration(1, 'd')), 'YYYY-MM-DD');
        }

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
