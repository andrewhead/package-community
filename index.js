/*jslint unparam: true */
/**
 * The boilerplate server creation, JSDOM creation, and D3 initialization
 * is based heavily on example code by dotob at 
 * https://gist.github.com/dotob/37b80cbbd9f0e1f135db
 */
var d3 = require('d3');
var jsdom = require('jsdom');
var http = require('http');
var SvgRuler = require('./svg_ruler').SvgRuler;
var BadgeAdder = require('./badge').BadgeAdder;


var DATA = require('./data/dump.node_post_stats2016-03-22_21:31:52.json');
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
    var tagNames = DATA.map(function(elem) { return elem.tag_name; });
    var uniqueTagNames = tagNames.reduce(function(names, name) {
        if (names.indexOf(name) === -1) {
            names.push(name);
        }
        return names;
    }, []);

    // Compute the average view rate for each tag
    var viewRates = DATA.map(function(elem) {
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


var showValuesAsRectangles = function (valueGroups, groupSize) {
    valueGroups.append('rect')
      .attr('fill-opacity', '.3')
      .attr('fill', '#010101')
      .attr('x', 4)
      .attr('y', 5)
      .attr('width', 0)
      .attr('height', groupSize.height - 8)
      .append('animate')
        .attr('attributeName', 'width')
        .attr('from', 0)
        .attr('to', groupSize.width - 10)
        .attr('dur', function(d) { return (3 / d.value).toFixed(2) + 's'; })
        .attr('repeatCount', 'indefinite');
    valueGroups.append('rect')
      .attr('fill', 'white')
      .attr('x', 4)
      .attr('y', 4)
      .attr('width', 0)
      .attr('height', groupSize.height - 8)
      .append('animate')
        .attr('attributeName', 'width')
        .attr('from', 0)
        .attr('to', groupSize.width - 10)
        .attr('dur', function(d) { return (3 / d.value).toFixed(2) + 's'; })
        .attr('repeatCount', 'indefinite');
};


/**
 * Create visualization and insert it into the window of the page.
 */
var makeVisualization = function (window, d3, callback) {

    var data = getViewRates();
    data.sort(function(a, b) { return b.value - a.value; });

    var graph = d3.select('body')
      .html('')
      .append('svg')
        .style('margin', 'auto')
        .style('padding-top', '100px')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    badgeAdder.addBadges(graph, data, "views", function() {
        return callback();   
    }, showValuesAsRectangles, 60);

};


var loadVisualization = function(res) {

    return function(errors, window) {
        window.d3 = d3.select(window.document);
        makeVisualization(window, window.d3, function() {

            // JSDOM erroneously lower-cases "linearGradient" tag.
            // With this brittle workaround, we just change it back to camel-case
            // wherever it appears in the HTML.
            var html = window.d3.select('body').html();
            var correctedHtml = html.replace(/lineargradient/g, 'linearGradient');

            res.writeHead(200, {'Content-Type': 'image/svg+xml' });
            res.end(correctedHtml);

        });
    };

};


http.createServer(function(req, res) {

    if (req.url.indexOf('favicon.ico') !== -1) {
        res.statusCode = 404;
        return;
    }

    jsdom.env({
        html: '',
        features: { QuerySelector: true },
        done: loadVisualization(res)
    });

}).listen(argv.port, "127.0.0.1");

console.log("Launched server on port", argv.port);
