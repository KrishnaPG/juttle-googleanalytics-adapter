# Juttle Google Analytics Adapter

[![Build Status](https://travis-ci.org/juttle/juttle-ga-adapter.svg?branch=master)](https://travis-ci.org/juttle/juttle-ga-adapter)

This is an adapter that allows Juttle to read data from [Google Analytics](http://www.google.com/analytics/) using the [Core Reporting API](https://developers.google.com/analytics/devguides/reporting/core/v3/)

It can pull data from various web properties and views to get visibility into usage data across sites.

## Examples

### Count pageviews and sessions for each web property over the past two weeks

```juttle
read ga | reduce pageviews=sum(pageviews), sessions=sum(sessions) by webProperty
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

### Plot a barchart of the 10 most popular non-blog pages across each property yesterday

```juttle
read ga -from :yesterday:
| reduce pageviews=sum(pageviews) by pagePath, webProperty
| filter pagePath !~ '*blog*'
| put url='${webProperty}${pagePath}'
| keep time, pageviews, url
| sort pageviews -desc
| head 10
| view barchart
```

### Show the pages most viewed by new users by referral source over the past week

```juttle
read ga -from :last week: -viewId 78763287
| reduce sum(pageviews) by userType, pagePath, source
| filter source != '(direct)' AND userType='New Visitor'
| sort sum -desc
| head 10
```

### List all the web properties and views in the account

```juttle
read ga | reduce by webProperty, webPropertyId, view, viewId
```

### Print today's visitors for a given site by each view

```juttle
read ga -from :today: -to :now: -webProperty 'www.jut.io'
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

## Ecosystem

The juttle-ga-adapter fits into the overall Juttle Ecosystem as one of the adapters in the [below diagram](https://github.com/juttle/juttle/blob/master/docs/juttle_ecosystem.md):

[![Juttle Ecosystem](https://github.com/juttle/juttle/raw/master/docs/images/JuttleEcosystemDiagram.png)](https://github.com/juttle/juttle/blob/master/docs/juttle_ecosystem.md)

## Authorization / Configuration

Before using the adapter, you need to create authorization credentials within the Google API, set up your Google Analytics account to allow access, and configure the Juttle runtime with the newly created credentials.

The steps of the process are enumerated in step 1 of the [Hello Analytics API Guide](https://developers.google.com/analytics/devguides/reporting/core/v3/quickstart/service-java#summary_auth). You don't need to do steps 2-4 in that guide but you should follow the instructions in step 1 to:

* Choose an existing Google API project or create a new project with access to the Analytics API
* Create a "service account" within the project and download the account credentials. Make sure you select the `JSON` key type and not the `P12` key type.
* Configure your Google Analytics account to allow "Read & Analyze" access by the email address created for the new service account.

Next the adapter needs to be registered and configured so that it can be used from within Juttle.

To do so, take the contents of the downloaded service account credentials file and add it to a new "ga" section in the adapters configuration of your `~/.juttle/config.json` file as follows:

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

The Google Analytics API exposes metrics for various event counts which can be aggregated across various dimensions. To access these counts in Juttle, you need to use a combination of [read](http://juttle.github.io/juttle/processors/read/) and [reduce](http://juttle.github.io/juttle/processors/reduce/), following the general form:

`read ga [options] | reduce [-every interval] v1=sum(metric1) [,v2=sum(metric2),...] [by dimension1, dimension2, ...]`

The `options` can include the following:

Name   | Type   | Description
-------|--------|-------------
`from` | moment | select points after this time (inclusive); default is 2 weeks ago
`to`   | moment | select points before this time (exclusive); default is the start of today
`viewId` | string | read data from only the given view (aka profile)
`webProperty` | string | read data from only the given property (specified either by name or id)

The options `from` and `to` control the time period for the query. The API only supports querying by whole day, so the values supplied to these options must be aligned to the start of a given day.

The other options are used to control which property or view is queried.

### Metrics and dimensions

Google Analytics exposes various metrics and dimensions that can be used in the reduce operation. You can access the full list in the [Dimensions & Metrics Explorer](https://developers.google.com/analytics/devguides/reporting/core/dimsmets). Note that not all metrics and dimensions are compatible with each other. Also when accessing these names in juttle, omit the `ga:` prefix from the name of the metric or dimension in the list above.

The only juttle reducer supported for the metrics is `sum` since the API only returns aggregate counts of events across the various dimensions. Also the `time` dimension keys should never be used in the `by` clause of `reduce`. Instead if you want to apply the operation over a time interval, you should pass that interval in the `-every` option to reduce.

The adapter also supports several metadata dimensions to group the results by the property and/or view. Any of `webProperty`, `webPropertyId`, `view`, `viewId` can be used in the `by` clause to group by the given dimension.

### Properties and Views

A given Google Analytics account can be used for multiple properties, each possibly containing multiple views, as described in the [hierarchy of accounts, users, properties, and views](https://support.google.com/analytics/answer/1009618?hl=en&ref_topic=3544906).

By default, the adapter reads from the `"All Web Site Data"` view in each property the user has access to. This ensures that each site is included without potentially duplicating counts which might happen if it included all views by default.

You can list the available views and properties by running:

```
read ga | reduce by webProperty, webPropertyId, view, viewId
```

To restrict the query to a specific view, pass the `-viewId` option to the read. This will make queries more efficient since it bypasses the step where the adapter has to query the metadata to determine the list of accessible views, which is more efficient and responsive when accessing only a single view.

To restrict the query to a given web property, pass the `-webProperty` option with either the name or the ID of the given property.

To access data from multiple views (either for a single property or for multiple properties), include `by view` and/or `by viewId` in the grouping clause of the `reduce` statement.



## Contributing

Want to contribute? Awesome! Don't hesitate to file an issue or open a pull
request.
