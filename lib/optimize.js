'use strict';

var _ = require('underscore');

/* global JuttleAdapterAPI */
var JuttleMoment = JuttleAdapterAPI.types.JuttleMoment;
var reducerDefaultValue = JuttleAdapterAPI.runtime.reducerDefaultValue;

let logger = JuttleAdapterAPI.getLogger('ga-optimize');

function _getFieldName(node) {
    if (node.type === 'UnaryExpression' && node.operator === '*' && node.argument.d) {
        return node.argument.value;

    } else { // node.type === 'Field'
        return node.name;
    }
}

function _getReducerName(node) {
    return node.callee.name;
}

function _isReducerCall(node) {
    return (node.type === 'CallExpression' && node.context === 'reduce');
}

let optimizer = {
    optimize_reduce: function(read, reduce, graph, optimization_info) {
        // Stash the reduce location in the optimization_info for better errors.
        optimization_info.location = reduce.location;

        if (! graph.node_contains_only_options(reduce, ['every', 'groupby'])) {
            optimization_info.invalid = 'reduce with options ' + graph.node_get_option_names(reduce);
            return false;
        }

        let metrics = [];
        let dimensions = [];
        let metagroup = null;
        let defaults = [];

        for (let i = 0; i < reduce.exprs.length; i++) {
            let expr = reduce.exprs[i];

            let target = _getFieldName(expr.left);
            if (target === 'time') {
                optimization_info.invalid = 'reduce on time';
                return false;
            }

            if (!_isReducerCall(expr.right)) {
                optimization_info.invalid = 'reduce other than sum(field)';
                return false;
            }

            let reducer = _getReducerName(expr.right);

            if (reducer !== 'sum') {
                optimization_info.invalid = 'reduce other than sum(field)';
                return false;
            }

            let arg = expr.right.arguments[0];
            if (arg.type !== 'StringLiteral') {
                optimization_info.invalid = 'reduce other than sum(field)';
                return false;
            }

            metrics.push(arg.value);
            defaults.push(reducerDefaultValue(reducer));
        }

        if (graph.node_has_option(reduce, 'every')) {
            let every = graph.node_get_option(reduce, 'every');

            if (every.eq(JuttleMoment.duration(1, 'm'))) {
                dimensions.push('dateHour', 'minute');

            } else if (every.eq(JuttleMoment.duration(1, 'h'))) {
                dimensions.push('dateHour');

            } else if (every.eq(JuttleMoment.duration(1, 'd'))) {
                dimensions.push('date');

            } else if (every.eq(JuttleMoment.duration(1, 'w'))) {
                dimensions.push('year', 'week');

            } else if (every.eq(JuttleMoment.duration(1, 'M'))) {
                dimensions.push('year', 'month');

            } else if (every.eq(JuttleMoment.duration(1, 'Y'))) {
                dimensions.push('year');

            } else {
                optimization_info.invalid = 'reduce with interval other than 1 minute, hour, day, week, month or year';
                return false;
            }
        }

        let groupby = graph.node_get_option(reduce, 'groupby');
        let grouped = groupby && groupby.length > 0;
        if (grouped) {
            let BAD_GROUPBY = ['time', 'date', 'dateHour', 'year', 'month', 'minute'];
            let META_GROUPBY = ['viewId', 'view', 'webPropertyId', 'webProperty'];
            let bad = _.intersection(groupby, BAD_GROUPBY);
            if (bad.length !== 0) {
                optimization_info.invalid = 'reduce group by ' + bad[0];
                return false;
            }

            // If a viewId is specified in the read options, then it's invalid
            // to group by any of the meta dimensions.
            if (graph.node_get_option(read, 'viewId')) {
                bad = _.intersection(groupby, META_GROUPBY);
                if (bad.length !== 0) {
                    optimization_info.invalid = '-viewId with reduce group by ' + bad[0];
                    return false;
                }
            }

            dimensions = dimensions.concat(_.difference(groupby, META_GROUPBY));
            if (_.contains(groupby, 'view') || _.contains(groupby, 'viewId')) {
                metagroup = 'view';
            } else if (_.contains(groupby, 'webProperty') || _.contains(groupby, 'webPropertyId')) {
                metagroup = 'webProperty';
            }
        }

        // The only case where no metric is allowed is if the user just wants to
        // enumerate the metadata groups, e.g. `reduce by view, viewId`
        if (metrics.length === 0 && metagroup === null) {
            optimization_info.invalid = `reduce${grouped ? ' by ' + groupby.join(',') : ''} without a metric`;
            return false;
        }

        optimization_info.location = undefined;
        _.extend(optimization_info, {
            type: 'reduce',
            metrics: metrics,
            dimensions: dimensions,
            metagroup: metagroup
        });

        logger.debug('optimization succeeded', JSON.stringify(optimization_info, null, 2));

        // Even when optimization "succeeds" return false so the original reduce
        // node will still be part of the flowgraph. This enables us to rely on
        // that reduce node to do post-processing of multi-view or
        // multi-property queries, inserting default values for missing batches,
        // adding marks, etc.
        return false;
    }
};

module.exports = optimizer;
