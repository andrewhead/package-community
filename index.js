/*jslint unparam: true */
/**
 * The boilerplate server creation, JSDOM creation, and D3 initialization
 * is based heavily on example code by dotob at 
 * https://gist.github.com/dotob/37b80cbbd9f0e1f135db
 */
var http = require('http');
var url = require('url');
var d3 = require('d3');
var jsdom = require('jsdom');

var SvgRuler = require('./svg_ruler').SvgRuler;
var BadgeAdder = require('./badge').BadgeAdder;


var POST_DATA = require('./data/dump.node_post_stats2016-03-22_21:31:52.json');
var TASK_DATA = require('./data/example_tasks.json');
var svgRuler = new SvgRuler();
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


var showValuesAsRectangles = function (valueGroups, contentBoxSize) {
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

    var graph = d3.select('body')
      .html('')
      .append('div')
        .append('svg')
          .style('display', 'block')
          .style('margin', 'auto')
          .style('padding-top', '30px')
          .attr('xmlns', 'http://www.w3.org/2000/svg')
          .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    badgeAdder.addBadges(graph, data, "tasks", function(svg) {
        return callback();
    }, {
        layout: {
            columnCount: 1,
        },
        contentWidth: 120,
        fillContentFunc: cycleTasks
    });

};


var makeViewBadges = function (window, d3, callback) {

    var data = getViewRates();
    data.sort(function(a, b) { return b.value - a.value; });

    var graph = d3.select('body')
      .html('')
      .append('div')
        .append('svg')
          .style('display', 'block')
          .style('margin', 'auto')
          .style('padding-top', '30px')
          .attr('xmlns', 'http://www.w3.org/2000/svg')
          .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    badgeAdder.addBadges(graph, data, "views", function(svg) {

        var badgeHeight = svg.select('rect').attr('height');

        svg.selectAll('g.badge')
          .append('text')
            .attr('font-size', '11')
            .attr('font-family', 'Open Sans')
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('x', -10)
            .attr('y', badgeHeight / 2)
            .text(function(d) { return d.tagName; });

        return callback();

    }, {
        fillContentFunc: showValuesAsRectangles,
        contentWidth: 60,
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
    } else {
        response.statusCode = 404;
        response.end();
        return;
    }

}).listen(argv.port, "127.0.0.1");

console.log("Launched server on port", argv.port);
