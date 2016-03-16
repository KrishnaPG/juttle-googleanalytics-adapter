# Juttle Google Analytics Adapter

[![Build Status](https://travis-ci.org/juttle/juttle-ga-adapter.svg?branch=master)](https://travis-ci.org/juttle/juttle-ga-adapter)

This is an adapter that allows Juttle to read data from [Google Analytics](http://www.google.com/analytics/) using the [Core Reporting API](https://developers.google.com/analytics/devguides/reporting/core/v3/)

It can pull data from various web properties and views to get visibility into usage data across sites.

## Examples

### Count pageviews and sessions for each web property over the past week

```juttle
read ga -last :day: | reduce pageviews=sum(pageviews), sessions=sum(sessions) by webProperty
```

```
┌──────────────┬────────────┬─────────────────────────────────────────┐
│ pageviews    │ sessions   │ webProperty                             │
├──────────────┼────────────┼─────────────────────────────────────────┤
│ 559          │ 292        │ www.mysite.io                           │
├──────────────┼────────────┼─────────────────────────────────────────┤
│ 2            │ 2          │ blog.mysite.io                          │
├──────────────┼────────────┼─────────────────────────────────────────┤
│ 16           │ 12         │ demo.mysite.io                          │
└──────────────┴────────────┴─────────────────────────────────────────┘
```

### Plot a barchart of the 10 most popular non-blog pages across each property

```juttle
read ga -last :1 week:
| reduce pageviews=sum(pageviews) by pagePath, webProperty
| filter pagePath !~ '*blog*'
| put url='${webProperty}${pagePath}'
| keep time, pageviews, url
| sort pageviews -desc
| head 10
| view barchart;
```

### Show the pages most viewed by new users by referral source over the past week

```juttle
read ga -last :w: -viewId 78763287
| reduce sum(pageviews) by userType, pagePath, source
| filter source != '(direct)' AND userType='New Visitor'
| sort sum -desc
| head 10
```

### List all the web properties and views in the account

```juttle
read ga | reduce by webProperty, webPropertyId, view, viewId
```

### Print the user counts for each view for a given site

```juttle
read ga -webProperty 'www.mysite.io'
| reduce users=sum(users) by view, viewId
```

## Installation

Like Juttle itself, the adapter is installed as a npm package. Both Juttle and the adapter need to be installed side-by-side:

```bash
$ npm install juttle
$ npm install juttle-ga-adapter
```

Alternatively you could install the juttle-engine which includes the adapter:

```bash
$ npm install juttle-engine
```

## Authorization / Configuration

First you need to enable the API and create a service account for authentication.

The process is enumerated in step 1 of the [Hello Analytics API Guide](https://developers.google.com/analytics/devguides/reporting/core/v3/quickstart/service-java#summary_auth). You don't need to do steps 2-4 in that guide.

Once you've created the account and are ready to download the credentials, make sure you select the `JSON` key type and not the `P12` key type. This should result in a file downloaded to your computer.

Next the adapter needs to be registered and configured so that it can be used from within Juttle.

To do so, take the contents of the service account JSON file and add it to a new "ga" section in the adapters configuration of your `~/.juttle/config.json` file as follows:

```json
{
    "adapters": {
        "ga": {
            "service_account": {
                "type": "service_account",
                "project_id": "<YOUR PROJECT ID>",
                "private_key_id": "<YOUR PROJECT KEY ID>",
                "private_key": "-----BEGIN PRIVATE KEY-----\n<YOUR PRIVATE KEY>\n-----END PRIVATE KEY-----\n",
                "client_email": "<YOUR ACCOUNT EMAIL>",
                "client_id": "<YOUR CLIENT ID>",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://accounts.google.com/o/oauth2/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/<YOUR ACCOUNT EMAIL>"
            }

        }
    }
}
```

## Usage

### Read options

Since google analytics returns aggregate data, the only supported query pattern using Juttle uses a combination of [read](http://juttle.github.io/juttle/processors/read/) and [reduce](http://juttle.github.io/juttle/processors/reduce/), using the general form:

`read ga [options] | reduce [-every interval] v1=sum(metric1) [,v2=sum(metric2),...] [by dimension1, dimension2, ...]`

The `options` can include the following:

Name   | Type   | Description
-------|--------|-------------
`from` | moment | select points after this time (inclusive); default is today
`to`   | moment | select points before this time (inclusive); default is today
`last` | duration | shorthand for `-from :now: - <duration> -to :now:`
`viewId` | string | read data from only the given view (aka profile)
`webProperty` | string | read data from only the given property (specified either by name or id)

The options `from`, `to`, and `last` control the time period for the query. The API only supports querying for full days, so the values supplied to these options are rounded to a whole day.

The other options are used to control which property or view is queried.

### Properties and Views

A given Google Analytics account can be used for multiple properties, each possibly containing multiple views, as described in the [hierarchy of accounts, users, properties, and views](https://support.google.com/analytics/answer/1009618?hl=en&ref_topic=3544906).

By default, the adapter reads from the `"All Web Site Data"` view in each property the user has access to. This ensures that each site is included without potentially duplicating counts which might happen if it included all views by default.

To restrict the query to a given web property, pass the `-webProperty` option with either the name or the ID of the given property.

To restrict the query to a specific view, pass the `-viewId` option to the read. This will bypass the step where the adapter has to query the metadata to determine the list of accessible views, which is more efficient and responsive when accessing only a single view.

To access data from multiple views (either for a single property or for multiple properties), include `by view` and/or `by viewId` in the grouping clause of the `reduce` statement.

### Metrics and dimensions

Google Analytics supports various metrics and dimensions that can be used in the reduce operation. You can access the full list in the [Dimensions & Metrics Explorer](https://developers.google.com/analytics/devguides/reporting/core/dimsmets). Not all metrics and dimensions are compatible with each other.

The only juttle reducer supported is `sum` and the `time` dimension keys should not be used in the `by` clause of `reduce`. Instead if you want to apply the operation over a time interval, you should pass that interval in the `-every` option to reduce.

The adapter also supports several metadata dimensions to group the results by the property and/or view. Any of `webProperty`, `webPropertyId`, `view`, `viewId` can be used in the `by` clause to group by the given dimension.

## Contributing

Want to contribute? Awesome! Don't hesitate to file an issue or open a pull
request.
