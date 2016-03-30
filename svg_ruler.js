var phantomjs = require('phantomjs-prebuilt');
var crypto = require('crypto');
var childProcess = require('child_process');

var redis = require('redis');
var redisClient = redis.createClient();


/**
 * Constructor for SvgRuler class
 */
var SvgRuler = function() {
    return;
};


/**
 * This method is really computationally expensive (it launches a phantomjs instance),
 * so we cache its results to speed up the return.
 */
SvgRuler.prototype.getSelectionSize = function(svg, selector, callback) {

    // Make hash of the HTML-selector combination for looking up cached sizes
    var svgHash = crypto.createHash('md5').update(selector + svg).digest('hex');

    // Check cache for previous computations this HTML element
    redisClient.get('width:' + svgHash, function(err, reply) {
        if (err) {
            return callback(err);
        }
        if (reply !== null) {
            var width = Number(reply);
            redisClient.get('height:' + svgHash, function(err, reply) {
                if (err) {
                    return callback(err);
                }
                if (reply !== null) {
                    var height = Number(reply);
                    return callback({
                        width: width,
                        height: height
                    });
                }
            });
        }
    });

    // This script will be run by PhantomJS (headless web browser) to find the
    // text length of text with a certain selector when HTML is rendered.
    var SCRIPT = "var page = require('webpage').create();" +
        "page.content = '" + svg + "';" +
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
        
        // Save size computation results to cache
        redisClient.set('width:' + svgHash, textSize.width);
        redisClient.set('height:' + svgHash, textSize.height);

        callback(textSize);

    });

    // Run script through PhantomJS REPL
    phantomProcess.stdin.write(new Buffer(SCRIPT));

};

module.exports = {
    SvgRuler: SvgRuler
};
