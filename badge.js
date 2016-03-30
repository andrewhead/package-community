var SvgRuler = require('./svg_ruler').SvgRuler;
var svgRuler = new SvgRuler();

var BadgeAdder = function() {
    return;
};


/**
 * SVG should be a D3 selection of an SVG.
 * D3 methods will be called extensively on this object.
 */
BadgeAdder.prototype.addBadges = function(
    svg, data, titleText, callback, fillValueFunc, valueContentWidth) {

    // Best guesses for evenly spacing badges in the SVG
    var BADGE_WIDTH = 110;
    var BADGE_HEIGHT = 30;
    var COLUMN_COUNT = 5;
    var COLUMN_PADDING = 15;
    var ROW_PADDING = 10;
    var ROW_COUNT = Math.ceil((data.length) / COLUMN_COUNT);  // may overestimate by 1

    // Set size to let the SVG hold all the content
    svg.attr('width', BADGE_WIDTH * COLUMN_COUNT + COLUMN_PADDING * (COLUMN_COUNT - 1))
      .attr('height', BADGE_HEIGHT * ROW_COUNT + ROW_PADDING * (ROW_COUNT - 1));

    // Add fonts necessary to render the text
    var styleString = '';
    var fontIndex;
    var FONT_URLS = [
       'http://fonts.googleapis.com/css?family=Open+Sans'
    ];
    for (fontIndex = 0; fontIndex < FONT_URLS.length; fontIndex++) {
        if (fontIndex !== 0) {
            styleString += '\n';
        }
        styleString += ("@import url(" + FONT_URLS[fontIndex] + ");");
    }
    svg.append('style')
      .html(styleString);

    var addContent = function(titleTextSize, valueContentSize) {

        var titleSize = { width: titleTextSize.width + 10, height: titleTextSize.height + 8 };
        var valueSize = { width: valueContentSize.width + 10, height: valueContentSize.height + 8 };

        var badges = svg.selectAll('g').data(data);
        badges.enter()
          .append('g')
            .attr('class', 'badge')
            .attr('transform', function(_, i) {
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
            .attr('height', titleSize.height)
            .attr('width', titleSize.width + valueSize.width);

        var colorings = titleRects.append('g')
          .attr('mask', function(_, i) { return 'url(#mask' + i + ')'; });

        colorings.append('path')
          .attr('d', 'M 0 0 h ' + titleSize.width + ' v ' + titleSize.height + ' H 0 z')
          .attr('fill', '#555');
        colorings.append('path')
          .attr('d', 'M ' + titleSize.width + ' 0 ' + 
                ' h ' + valueSize.width +
                ' v ' + valueSize.height +
                ' H ' + titleSize.width + ' z')
          .attr('fill', '#4c1');
        colorings.append('path')
          .attr('d', 'M 0 0 h ' + (titleSize.width + valueSize.width) + 
                ' v ' + titleSize.height + ' H 0 z')
          .attr('fill', function(_, i) { return 'url(#gradient' + i + ')'; });

        var titleGroups = titleRects.append('g')
          .attr('font-size', '11')
          .attr('font-family', 'Open Sans')
          .attr('text-anchor', 'left')
          .attr('fill', '#fff');

        titleGroups.append('text')
          .attr('class', 'title_text')
          .attr('fill-opacity', '.3')
          .attr('fill', '#010101')
          .attr('x', 6)
          .attr('y', titleSize.height - 4)
          .text(titleText);
        titleGroups.append('text')
          .attr('x', 6)
          .attr('y', titleSize.height - 5)
          .text(titleText);

        var valueGroups = titleRects.append('g')
          .attr('font-size', '11')
          .attr('font-family', 'Open Sans')
          .attr('text-anchor', 'left')
          .attr('fill', '#fff')
          .attr('transform', 'translate(' + titleSize.width + ',0)');

        if (fillValueFunc === undefined) {
            valueGroups.append('text')
              .attr('class', 'value_text')
              .attr('fill-opacity', '.3')
              .attr('fill', '#010101')
              .attr('x', titleSize.width + 4)
              .attr('y', valueSize.height - 4)
              .text(function(d) { return d.value; });
            valueGroups.append('text')
              .attr('x', titleSize.width + 4)
              .attr('y', valueSize.height - 5)
              .text(function(d) { return d.value; });
        } else {
            fillValueFunc(valueGroups, valueSize);
        }
        return callback();
    };


    var get_svg_html = function(svg_selection) {
        return svg_selection[0].parentNode.outerHTML;
    };
    var titleTestText = svg.append('text')
      .attr('font-size', '11')
      .attr('font-family', 'Open Sans')
      .attr('text-anchor', 'left')
      .text(titleText);
    var titleTextSize;
    svgRuler.getSelectionSize(get_svg_html(svg), 'text', function(size) {

        titleTextSize = size;
        titleTestText.remove();

        var valueTestText = svg.append('text')
          .attr('font-size', '11')
          .attr('font-family', 'Open Sans')
          .attr('text-anchor', 'left')
          .text(data[0].value);
        svgRuler.getSelectionSize(get_svg_html(svg), 'text', function(size) {

            if (valueContentWidth === undefined) {
                valueContentWidth = size.width;
            }

            var valueContentSize = {
                width: valueContentWidth,
                height: titleTextSize.height
            };
            valueTestText.remove();
            addContent(titleTextSize, valueContentSize);

        });
    });

};

module.exports = {
    BadgeAdder: BadgeAdder
};
