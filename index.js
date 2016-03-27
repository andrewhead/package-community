/**
 * The boilerplate server creation, JSDOM creation, and D3 initialization
 * is based heavily on example code by dotob at 
 * https://gist.github.com/dotob/37b80cbbd9f0e1f135db
 */
var d3 = require('d3');
var http = require('http');
var jsdom = require('jsdom');
var phantomjs = require('phantomjs-prebuilt');
var childProcess = require('child_process');
var path = require('path');
var DATA = require('./data/dump.node_post_stats2016-03-22_21:31:52.json');

// Get server arguments
var argv = require('yargs')
    .default('port', 8080)
    .argv;

var FONT_URLS = [
   'http://fonts.googleapis.com/css?family=Open+Sans'
];


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
                viewRate: viewRateSums[tagName].sum / viewRateSums[tagName].count
            });
        }
    }

    return averageViewRates;
};


var getTextSize = function(html, selector, callback) {

    // This script will be run by PhantomJS (headless web browser) to find the
    // text length of text with a certain selector when HTML is rendered.
    var SCRIPT = "var page = require('webpage').create();" +
        "page.content = '" + html + "';" +
        "var size = page.evaluate(function() {" +
        "    var bBox = document.querySelector('" + selector + "').getBBox();" +
        "    return bBox.width + ',' + bBox.height; " +
        "});" +
        "console.log('{{ Text Size:', size, '}}');" +
        "phantom.exit()\n";  // New line has to come at end to run the REPL.

    // Launch PhantomJS REPL
    var phantomProcess = childProcess.spawn(phantomjs.path);

    // Capture output from script, return text size
    var output = "";
    phantomProcess.stdout.on('data', function(d) {
        output += String(d);
    });
    phantomProcess.stdout.on('end', function() {

        var textSizeString = output.replace(/.*\{\{ Text Size: ([0-9.,]*) \}\}.*/, "$1");
        var sizeTokens = textSizeString.split(',');

        // In a couple of test cases, we found that PhantomJS tends to understimate
        // the bouding box of the badge as it appears in Firefox and Chrome by ~1.2x.
        var textSize = {
            width: Number(sizeTokens[0]) * 1.2,
            height: Number(sizeTokens[1]) * 1.2
        };
        callback(textSize);

    });

    // Run script through PhantomJS REPL
    phantomProcess.stdin.write(new Buffer(SCRIPT));

};


/**
 * Create visualization and insert it into the window of the page.
 */
var makeVisualization = function (window, d3, callback) {

    var COLUMN_COUNT = 5;
    var BADGE_WIDTH = 110;
    var BADGE_HEIGHT = 30;
    var COLUMN_PADDING = 15;
    var ROW_PADDING = 10;

    var data = getViewRates();
    data.sort(function(a, b) { return b.viewRate - a.viewRate; });
    var ROW_COUNT = Math.ceil((data.length) / COLUMN_COUNT);  // may overestimate by 1

    var graph = d3.select('body')
      .html('')
      .append('svg')
        .style('margin', 'auto')
        .style('padding-top', '100px')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink')
        .attr('width', BADGE_WIDTH * COLUMN_COUNT + COLUMN_PADDING * (COLUMN_COUNT - 1))
        .attr('height', BADGE_HEIGHT * ROW_COUNT + ROW_PADDING * (ROW_COUNT - 1));

    var styleString = '';
    var fontIndex;
    for (fontIndex = 0; fontIndex < FONT_URLS.length; fontIndex++) {
        if (fontIndex !== 0) {
            styleString += '\n';
        }
        styleString += ("@import url(" + FONT_URLS[fontIndex] + ");");
    }
    graph.append('style')
      .html(styleString);

    var addBadges = function(graph, data, titleTextDim, valueTextDim) {

        if (titleTextDim === undefined) {
            titleTextDim = { width: 40, height: 12 };
        }
        if (valueTextDim === undefined) {
            valueTextDim = { width: 40, height: 12 };
        }

        var titleDim = { width: titleTextDim.width + 10, height: titleTextDim.height + 8 };
        var valueDim = { width: valueTextDim.width + 10, height: valueTextDim.height + 8 };

        var badges = graph.selectAll('g').data(data);
        badges.enter()
          .append('g')
            .attr('class', 'badge')
            .attr('transform', function(d, i) {
                var row = Math.floor(i / COLUMN_COUNT);
                var col = i % COLUMN_COUNT;
                var x = col * (BADGE_WIDTH + COLUMN_PADDING);
                var y = row * (BADGE_HEIGHT + ROW_PADDING);
                return 'translate(' + x + ',' + y + ')'; 
            });

        var titleRects = badges.append('g');

        // Badges based on reverse engineering the Shields.IO badge format.
        // See specification at:
        // https://github.com/badges/shields/blob/master/spec/SPECIFICATION.md
        // Also, see a rendered example at:
        // https://img.shields.io/badge/bowser-vanquished-brightgreen.svg
        var gradients = titleRects.append('defs').append('linearGradient')
          .attr('id', function(_, i) { return 'gradient' + i; })
          .attr('y2', "100%")
          .attr('x2', '0');

        gradients.append('stop')
          .attr('stop-opacity', '.1')
          .attr('stop-color', '#bbb')
          .attr('offset', '0');

        gradients.append('stop')
          .attr('stop-opacity', '.1')
          .attr('offset', '1');

        titleRects.append('mask')
          .attr('id', function(_, i) { return 'mask' + i; })
          .append('rect')
            .attr('fill', '#fff')
            .attr('rx', '3')
            .attr('height', titleDim.height)
            .attr('width', titleDim.width + valueDim.width);

        var colorings = titleRects.append('g')
          .attr('mask', function(_, i) { return 'url(#mask' + i + ')'; });

        colorings.append('path')
          .attr('d', 'M 0 0 h ' + titleDim.width + ' v ' + titleDim.height + ' H 0 z')
          .attr('fill', '#555');
        colorings.append('path')
          .attr('d', 'M ' + titleDim.width + ' 0 ' + 
                ' h ' + valueDim.width +
                ' v ' + valueDim.height +
                ' H ' + titleDim.width + ' z')
          .attr('fill', '#4c1');
        colorings.append('path')
          .attr('d', 'M 0 0 h ' + (titleDim.width + valueDim.width) + 
                ' v ' + titleDim.height + ' H 0 z')
          .attr('fill', function(_, i) { return 'url(#gradient' + i + ')'; });

        var textGroups = titleRects.append('g')
          .attr('font-size', '11')
          .attr('font-family', 'Open Sans')
          .attr('text-anchor', 'left')
          .attr('fill', '#fff');

        textGroups.append('text')
          .attr('class', 'title_text')
          .attr('fill-opacity', '.3')
          .attr('fill', '#010101')
          .attr('x', 6)
          .attr('y', titleDim.height - 4)
          .text("views");
        textGroups.append('text')
          .attr('x', 6)
          .attr('y', titleDim.height - 5)
          .text("views");

        textGroups.append('text')
          .attr('class', 'value_text')
          .attr('fill-opacity', '.3')
          .attr('fill', '#010101')
          .attr('x', titleDim.width + 4)
          .attr('y', valueDim.height - 4)
          .text(function(d) { return d.viewRate.toFixed(2) + " / day"; });
        textGroups.append('text')
          .attr('x', titleDim.width + 4)
          .attr('y', valueDim.height - 5)
          .text(function(d) { return d.viewRate.toFixed(2) + " / day"; });

    };

    // Get the sizes of the content of a test badge.
    addBadges(graph, [{ tagName: 'views', viewRate: 8.88 }]);
    var html = d3.select('body').html();
    var quotedHtml = html.replace(/'/g, '"');
    getTextSize(quotedHtml, '.title_text', function(titleTextSize) {
        getTextSize(quotedHtml, '.value_text', function(valueTextSize) {

            console.log(titleTextSize.height);

            graph.selectAll('.badge').remove();
            addBadges(graph, data, titleTextSize, valueTextSize);
            callback();

        });
    });

    /*
    titleRects.append('rect')
      .attr('fill', 'grey')
      .attr('width', 100)
      .attr('height', 30);

    titleRects.append('text')
      .attr('fill', 'white')
      .attr('text-anchor', 'middle')
      .attr('x', 50)
      .text("views");

    var valueRects = badges.append('g')
      .attr('transform', 'translate(100, 0)');

    valueRects.append('rect')
      .attr('fill', 'green')
      .attr('width', 100)
      .attr('height', 30);

    valueRects.append('text')
      .attr('fill', 'white')
      .attr('text-anchor', 'middle')
      .attr('x', 50)
      .attr('y', 20)
      .text(function(d) { return d.viewRate.toFixed(2) + "/day"; });
    */

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
