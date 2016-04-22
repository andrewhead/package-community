/*jslint unparam: true */
/**
 * The boilerplate server creation, JSDOM creation, and D3 initialization
 * is based heavily on example code by dotob at 
 * https://gist.github.com/dotob/37b80cbbd9f0e1f135db
 */
// Load external packages
var http = require('http');
var url = require('url');
var d3 = require('d3');
var jsdom = require('jsdom');

// Load dump data (temporary until this is replaced with database access)
var POST_DATA = require('./data/dump.node_post_stats2016-03-22_21:31:52.json');
var TASK_DATA = require('./data/example_tasks.json');

// Load other miscellaneous data
var PACKAGE_TAGS = require('./package-tags.json');

// Start the redis server for caching
var redis = require('redis');
var redisClient = redis.createClient();
var dataKeyName = function(basename) {
    return 'package-community:data:' + basename;
};

// Connect to the database
var postgresConfig = require('./reader-pg-config.json');
var knex = require('knex')({
    dialect: 'postgres',
    connection: {
        host: postgresConfig.host,
        port: postgresConfig.port,
        user: postgresConfig.username,
        password: postgresConfig.password,
        database: postgresConfig.database,
    },
});

// Create global utilities
var BadgeAdder = require('./badge').BadgeAdder;
var badgeAdder = new BadgeAdder();


// Get server arguments
var argv = require('yargs')
    .default('port', 8080)
    .argv;


var getViewRates = function() {

    // Estimate of the date at which the final view counts were reported.
    // See research notes for rationale.
    var FINAL_DATE = new Date(2016, 3, 6, 4, 19);

    // Compute list of the unique tag names.
    var tagNames = POST_DATA.map(function(elem) { return elem.tag_name; });
    var uniqueTagNames = tagNames.reduce(function(names, name) {
        if (names.indexOf(name) === -1) {
            names.push(name);
        }
        return names;
    }, []);

    // Compute the average view rate for each tag
    var viewRates = POST_DATA.map(function(elem) {
        var creationDate = new Date(elem.creation_date);
        var millisecondsPassed = FINAL_DATE - creationDate;
        var daysPassed = millisecondsPassed / (24 * 60 * 60 * 1000);
        return {
            tagName: elem.tag_name,
            viewRate: elem.view_count / daysPassed
        };
    });

    var initialSums = {};
    uniqueTagNames.forEach(function(tagName) {
        initialSums[tagName] = { sum: 0, count: 0 };
    });

    var viewRateSums = viewRates.reduce(function(sums, record) {
        sums[record.tagName].sum += record.viewRate;
        sums[record.tagName].count += 1;
        return sums;
    }, initialSums);

    var averageViewRates = [];
    var tagName;
    for (tagName in viewRateSums) {
        if (viewRateSums.hasOwnProperty(tagName)) {
            averageViewRates.push({
                tagName: tagName,
                value: (viewRateSums[tagName].sum / viewRateSums[tagName].count).toFixed(2)
            });
        }
    }

    return averageViewRates;
};


var makeD3Doc = function(d3) {
    return d3.select('body')
      .html('')
      .append('div')
        .append('svg')
          .style('display', 'block')
          .style('margin', 'auto')
          .style('padding-top', '30px')
          .attr('xmlns', 'http://www.w3.org/2000/svg')
          .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');
};


var PERCENTAGE_BAR_WIDTH = 16;
var PERCENTAGE_BAR_PADDING = 5;
var fillPercentageBars = function (valueGroups, contentBoxSize) {
    var outlineHeight = contentBoxSize.height - 8;
    valueGroups.append('rect')
      .attr('fill', 'none')
      .attr('stroke', '#010101')
      .attr('stroke-width', '1')
      .attr('x', 4)
      .attr('y', 5)
      .attr('width', PERCENTAGE_BAR_WIDTH)
      .attr('height', outlineHeight);
    valueGroups.append('rect')
      .attr('fill', 'none')
      .attr('stroke', 'white')
      .attr('stroke-width', '1')
      .attr('x', 4)
      .attr('y', 4)
      .attr('width', PERCENTAGE_BAR_WIDTH)
      .attr('height', outlineHeight);
    valueGroups.append('rect')
      .attr('fill', 'white')
      .attr('x', 4)
      .attr('width', PERCENTAGE_BAR_WIDTH)
      .attr('height', function(d) { return d.value * outlineHeight; })
      .attr('y', function(d) { return 4 + (1 - d.value) * outlineHeight; });
};  


var fillAnimatedRectangles = function (valueGroups, contentBoxSize) {
    valueGroups.append('rect')
      .attr('fill-opacity', '.3')
      .attr('fill', '#010101')
      .attr('x', 4)
      .attr('y', 5)
      .attr('width', 0)
      .attr('height', contentBoxSize.height - 8)
      .append('animate')
        .attr('attributeName', 'width')
        .attr('from', 0)
        .attr('to', contentBoxSize.width - 10)
        .attr('dur', function(d) { return (3 / d.value).toFixed(2) + 's'; })
        .attr('repeatCount', 'indefinite');
    valueGroups.append('rect')
      .attr('fill', 'white')
      .attr('x', 4)
      .attr('y', 4)
      .attr('width', 0)
      .attr('height', contentBoxSize.height - 8)
      .append('animate')
        .attr('attributeName', 'width')
        .attr('from', 0)
        .attr('to', contentBoxSize.width - 10)
        .attr('dur', function(d) { return (3 / d.value).toFixed(2) + 's'; })
        .attr('repeatCount', 'indefinite');
};


var addLabels = function(callback) {
    return function(svg) {
        // Add labels for the tag names
        var badgeHeight = svg.select('rect').attr('height');
        svg.selectAll('g.badge')
          .append('text')
            .attr('font-size', '11')
            .attr('font-family', 'DejaVu Sans,Verdana,Geneva,sans-serif')
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('x', -10)
            .attr('y', badgeHeight / 2)
            .text(function(d) { return d.tagName; });
        callback();
    };
};


var makeTaskBadges = function (window, d3, callback) {

    var data = TASK_DATA;
    data.forEach(function(packageEntry) {
        packageEntry.value = packageEntry.tasks;
    });

    var cycleTasks = function(contentGroups, contentSize) {

        var animate = function(selection) {
            // A lot of complicated syntax to basically mean "cycle through all strings"
            selection.append('animate')                
              .attr('dur', function(d) { return d.groupSize + 's'; })
              .attr('attributeName', 'fill-opacity')
              .attr('keyTimes', function(d, i) {
                  var attack = 0.2 / d.groupSize;
                  var sustain = 0.6 / d.groupSize;
                  var release = 0.2 / d.groupSize;
                  var period = attack + sustain + release;
                  var onset = i * period;
                  return [0, onset, onset + attack, onset + attack + sustain, onset + attack + sustain + release, 1].join(';');
              }).attr('values', [0, 0, 1, 1, 0, 0].join(';'))
              .attr('repeatCount', 'indefinite');
        };

        var messages = contentGroups.selectAll('g')
          .data(function(d) {
              return d.value.map(function(task) {
                  return { 
                      groupSize: d.value.length,
                      task: task
                  };
              }); 
          }).enter()
            .append('g');
            
        messages.append('text')
          .attr('x', 4)
          .attr('y', contentSize.height - 4)
          .attr('fill-opacity', '.3')
          .attr('fill', '#010101')
          .text(function(d) { return d.task; })
          .call(animate);

        messages.append('text')
          .attr('x', 4)
          .attr('y', contentSize.height - 5)
          .attr('fill-opacity', '0')
          .text(function(d) { return d.task; })
          .call(animate);

    };

    var doc = makeD3Doc(d3);
    badgeAdder.addBadges(doc, data, "tasks", callback, {
        layout: {
            columnCount: 1,
        },
        contentWidth: 120,
        fillContentFunc: cycleTasks
    });

};


var makeSinceBadges = function (window, d3, callback) {

    var doc = makeD3Doc(d3);

    knex('webpageversion')
        .select('package')
        .min('timestamp as first_timestamp')
        .groupBy('package')
        // This fetch index gets the most recent, clean, complete search results at the time
        // that I coded this.  We don't filter based on the fetch index of webpageversion---
        // the fetcher for this doesn't insert duplicate timestamp-URL pairs.
        .where({
            'search.fetch_index': 22,
        })
        .join('searchresult', 'webpageversion.url', 'searchresult.url')
        .join('search', 'search_id', 'search.id')
        .orderBy('first_timestamp', 'asc')
    .then(function(results) {

        var data = results.map(function(row) {
            return {
                tagName: row.package,
                value: String(row.first_timestamp.getUTCFullYear())
            };
        });

        badgeAdder.addBadges(doc, data, "documented since", addLabels(callback), {
            layout: {
                columnCount: 2,
                margin: {
                    left: 140,
                },
                columnPadding: 140
            }
        });
    });

};


var makeAnswerBadges = function (window, d3, callback) {


    var doc = makeD3Doc(d3);
    var addBadges = function(data) {
        badgeAdder.addBadges(doc, data, "stack overflow answer %", addLabels(callback), {
            fillContentFunc: fillPercentageBars,
            displayValue: true,
            isPercent: true,
            contentPadding: PERCENTAGE_BAR_WIDTH + PERCENTAGE_BAR_PADDING,
            contentOffset: PERCENTAGE_BAR_WIDTH + PERCENTAGE_BAR_PADDING,
            valueRange: [1, 0.25],
            layout: {
                columnCount: 2,
                margin: {
                    left: 140,
                },
                columnPadding: 140
            }
        });
    };

    // We use caching here as the query below is pretty expensive.
    redisClient.get(dataKeyName('answer-rates'), function(err, reply) {
        var data;
        if (err) {
            return callback(err);
        }
        if (reply !== null) {
            data = JSON.parse(reply);
            addBadges(data);
        } else {
            knex('questionsnapshot')
                .select(
                    'tag_name',
                    knex.raw("COUNT(CASE WHEN (answer_count > 0) " +
                        "THEN true ELSE NULL END)::decimal / COUNT(*) AS ratio")
                )
                .join('questionsnapshottag', 'questionsnapshot.id', 'question_snapshot_id')
                .join('tag', 'tag.id', 'tag_id')
                // This is an arbitrary fetch of the question snapshots in the past.
                .where('fetch_index', 13)
                .whereIn('tag_name', PACKAGE_TAGS)
                .groupBy('tag_name')
                .orderBy('ratio', 'desc')
            .then(function(results) {
                data = results.map(function(row) {
                    return {
                        tagName: row.tag_name,
                        value: row.ratio,
                    };
                });
                redisClient.set(dataKeyName('answer-rates'), JSON.stringify(data));
                addBadges(data);
            });
        }
    });

};


var makeResultsBadges = function (window, d3, callback) {

    var doc = makeD3Doc(d3);
    var addBadges = function(data) {
        badgeAdder.addBadges(doc, data, "google results with code", addLabels(callback), {
            fillContentFunc: fillPercentageBars,
            displayValue: true,
            isPercent: true,
            valueRange: [1, 0],
            contentPadding: PERCENTAGE_BAR_WIDTH + PERCENTAGE_BAR_PADDING,
            contentOffset: PERCENTAGE_BAR_WIDTH + PERCENTAGE_BAR_PADDING,
            layout: {
                columnCount: 2,
                margin: {
                    left: 140,
                },
                columnPadding: 140
            }
        });
    };

    // We use caching here as the query below is pretty expensive.
    redisClient.get(dataKeyName('results'), function(err, reply) {
        var data;
        if (err) {
            return callback(err);
        }
        if (reply !== null) {
            data = JSON.parse(reply);
            addBadges(data);
        } else {
            knex.select(
                'package',
                knex.raw("SUM(pages_with_code) / (SUM(pages_with_code) + SUM(pages_without_code))::decimal AS ratio")
              )
              .groupBy('package')
              .orderBy('ratio', 'desc')
              .from(function() {
                this.select('package', 'web_page_url')
                .count('page_has_code AS pages_with_code')
                .count('page_missing_code AS pages_without_code')
                .from(function() {
                  this.select(
                    'webpagecontent.url AS web_page_url',
                    knex.raw("BOOL_OR(CASE WHEN (compute_index IS NULL) THEN true ELSE NULL END) AS page_missing_code"),
                    // The value of the compute index below is the index of the most recent complete
                    // extraction of code from web pages at the time of writing this code.
                    knex.raw("BOOL_OR(CASE WHEN (compute_index = 3) THEN true ELSE NULL END) AS page_has_code")
                  )
                  .from('webpagecontent')
                  .leftOuterJoin('code', 'web_page_id', 'webpagecontent.id')
                  // The following joins are just here so that we can restrict ourselves to only the web page
                  // content associated with a single search results fetch.  Fetch index 13 was the search
                  // results fetch at which the largest group of web page content was fetched.
                  .join('searchresultcontent', 'content_id', 'webpagecontent.id')
                  .join('searchresult', 'search_result_id', 'searchresult.id')
                  .join('search', 'search_id', 'search.id')
                  .where('search.fetch_index', 13)
                  .groupBy('webpagecontent.id')
                  .as('pages_have_code');
                })
                .join('searchresult', 'web_page_url', 'searchresult.url')
                .join('search', 'search.id', 'search_id')
                .where('search.fetch_index', 13)
                .groupBy('web_page_url', 'package')
                .as('page_occurrences_with_code');
              })
            .then(function(results) {
                data = results.map(function(row) {
                    return {
                        tagName: row.package,
                        value: row.ratio,
                    };
                });
                redisClient.set(dataKeyName('results'), JSON.stringify(data));
                addBadges(data);
            });
        }
    });

};

var makeViewBadges = function (window, d3, callback) {

    var data = getViewRates();
    data.sort(function(a, b) { return b.value - a.value; });

    var doc = makeD3Doc(d3);
    badgeAdder.addBadges(doc, data, "views", addLabels(callback), {
        fillContentFunc: fillAnimatedRectangles,
        contentWidth: 60,
        valueRange: [2.5, 0.1],
        layout: {
            columnCount: 2,
            margin: {
                left: 140,
            },
            columnPadding: 140
        }
    });

};


http.createServer(function(request, response) {

    var fillPage = function(func) {
        jsdom.env({
            html: '',
            features: { QuerySelector: true },
            done: function(errors, window) { 

                // Create D3 for making visualizations
                window.d3 = d3.select(window.document);

                // Call the provided function to fill thhe page
                func(window, window.d3, function() {
                    // JSDOM erroneously lower-cases "linearGradient" tag.
                    // With this brittle workaround, we just change it back to camel-case
                    // wherever it appears in the HTML.
                    var html = window.document.documentElement.outerHTML;
                    var correctedHtml = html.replace(/lineargradient/g, 'linearGradient');
                    response.writeHead(200, {'Content-Type': 'image/svg+xml' });
                    response.end(correctedHtml);
                });
            }
        });
    };

    var pathname = url.parse(request.url).pathname;
    if (pathname === '/' || pathname === '/views') {
        fillPage(makeViewBadges);
    } else if (pathname === '/tasks') {
        fillPage(makeTaskBadges);   
    } else if (pathname === '/since') {
        fillPage(makeSinceBadges);
    } else if (pathname === '/answers') {
        fillPage(makeAnswerBadges);   
    } else if (pathname === '/results') {
        fillPage(makeResultsBadges);   
    } else {
        response.statusCode = 404;
        response.end();
        return;
    }

}).listen(argv.port, "127.0.0.1");

console.log("Launched server on port", argv.port);
