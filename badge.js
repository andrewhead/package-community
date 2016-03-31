var _ = require('lodash');
var SvgRuler = require('./svg_ruler').SvgRuler;
var svgRuler = new SvgRuler();

var BadgeAdder = function() {
    return;
};


/**
 * SVG should be a D3 selection of an SVG.
 * D3 methods will be called extensively on this object.
 */
BadgeAdder.prototype.addBadges = function(svg, data, titleText, callback, callerOptions) {
    
    var defaultOptions = {
        fillContentFunc: undefined,
        contentWidth: undefined,
        layout: {
            margin: {
                left: 40,
                right: 40,
                top: 40,
                bottom: 40
            },
            columnCount: 5,
            columnPadding: 15,
            rowPadding: 10,
        }
    };
    var options = _.merge({}, defaultOptions, callerOptions);

    // Compute number of rows automatically based on the number of columns and the data size
    options.layout.rowCount = Math.ceil((data.length) / options.layout.columnCount);
    var layout = options.layout;

    // Add fonts necessary to render the text
    var styleString = '';
    var fontIndex;
    var FONT_URLS = ['http://fonts.googleapis.com/css?family=Open+Sans'];
    for (fontIndex = 0; fontIndex < FONT_URLS.length; fontIndex++) {
        if (fontIndex !== 0) {
            styleString += '\n';
        }
        styleString += ("@import url(" + FONT_URLS[fontIndex] + ");");
    }
    svg.append('style')
      .html(styleString);

    var addContent = function(titleTextSize, contentSize) {

        // Set the dimensions of the SVG and internal components based on the measured badge dimensions
        var titleSize = { width: titleTextSize.width + 10, height: titleTextSize.height + 8 };
        var contentBoxSize = { width: contentSize.width + 10, height: contentSize.height + 8 };
        var badgeWidth = titleSize.width + contentBoxSize.width;
        var badgeHeight = titleSize.height;

        var width = (
            layout.margin.left +
            badgeWidth * layout.columnCount +
            layout.columnPadding * (layout.columnCount - 1) +
            layout.margin.right
        );
        var height = (
            layout.margin.top + 
            badgeHeight * layout.rowCount +
            layout.rowPadding * (layout.rowCount - 1) +
            layout.margin.bottom
        );
        svg.attr('width', width).attr('height', height);

        var badges = svg.selectAll('g').data(data);
        badges.enter()
          .append('g')
            .attr('class', 'badge')
            .attr('transform', function(_, i) {
                var row = Math.floor(i / layout.columnCount);
                var col = i % layout.columnCount;
                var x = layout.margin.left + col * (badgeWidth + layout.columnPadding);
                var y = layout.margin.top + row * (badgeHeight + layout.rowPadding);
                return 'translate(' + x + ',' + y + ')'; 
            });

        var badgeRects = badges.append('g');

        // Badges based on reverse engineering the Shields.IO badge format.
        // See specification at:
        // https://github.com/badges/shields/blob/master/spec/SPECIFICATION.md
        // Also, see a rendered example at:
        // https://img.shields.io/badge/bowser-vanquished-brightgreen.svg
        var gradients = badgeRects.append('defs').append('linearGradient')
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

        badgeRects.append('mask')
          .attr('id', function(_, i) { return 'mask' + i; })
          .append('rect')
            .attr('fill', '#fff')
            .attr('rx', '3')
            .attr('height', titleSize.height)
            .attr('width', titleSize.width + contentBoxSize.width);

        var colorings = badgeRects.append('g')
          .attr('mask', function(_, i) { return 'url(#mask' + i + ')'; });

        colorings.append('path')
          .attr('d', 'M 0 0 h ' + titleSize.width + ' v ' + titleSize.height + ' H 0 z')
          .attr('fill', '#555');
        colorings.append('path')
          .attr('d', 'M ' + titleSize.width + ' 0 ' + 
                ' h ' + contentBoxSize.width +
                ' v ' + contentBoxSize.height +
                ' H ' + titleSize.width + ' z')
          .attr('fill', '#4c1');
        colorings.append('path')
          .attr('d', 'M 0 0 h ' + (titleSize.width + contentBoxSize.width) + 
                ' v ' + titleSize.height + ' H 0 z')
          .attr('fill', function(_, i) { return 'url(#gradient' + i + ')'; });

        var titleGroups = badgeRects.append('g')
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

        var contentGroups = badgeRects.append('g')
          .attr('font-size', '11')
          .attr('font-family', 'Open Sans')
          .attr('text-anchor', 'left')
          .attr('fill', '#fff')
          .attr('transform', 'translate(' + titleSize.width + ',0)');

        if (options.fillContentFunc === undefined) {
            contentGroups.append('text')
              .attr('class', 'content_text')
              .attr('fill-opacity', '.3')
              .attr('fill', '#010101')
              .attr('x', titleSize.width + 4)
              .attr('y', contentBoxSize.height - 4)
              .text(function(d) { return d.value; });
            contentGroups.append('text')
              .attr('x', titleSize.width + 4)
              .attr('y', contentBoxSize.height - 5)
              .text(function(d) { return d.value; });
        } else {
            options.fillContentFunc(contentGroups, contentBoxSize);
        }

        // Now that the badges have been added, return the finished SVG
        return callback(svg);

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

        var contentTestText = svg.append('text')
          .attr('font-size', '11')
          .attr('font-family', 'Open Sans')
          .attr('text-anchor', 'left')
          .text(data[0].content);
        svgRuler.getSelectionSize(get_svg_html(svg), 'text', function(size) {

            if (options.contentWidth === undefined) {
                options.contentWidth = size.width;
            }

            var contentContentSize = {
                width: options.contentWidth,
                height: titleTextSize.height
            };
            contentTestText.remove();
            addContent(titleTextSize, contentContentSize);

        });
    });

};

module.exports = {
    BadgeAdder: BadgeAdder
};
