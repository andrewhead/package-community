var _ = require('lodash');
var d3 = require('d3');
var measureTextWidth = require('./measure-text');

var BadgeAdder = function() { return; };


var getDisplayValue = function(d) {
    if (d._badgeAdderIsPercent === true) {
        return String((d.value * 100).toFixed(1)) + '%';
    }
    return d.value;
};

/**
 * SVG should be a D3 selection of an SVG.
 * D3 methods will be called extensively on this object.
 */
BadgeAdder.prototype.addBadges = function(svg, data, titleText, callback, callerOptions) {
    
    var defaultOptions = {
        fillContentFunc: undefined,
        displayValue: undefined,
        contentWidth: undefined,
        contentPadding: 0,
        contentOffset: 0,
        valueRange: undefined,  // if you want colors to vary by value
        isPercent: false,
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

    // Propagate whether this value represents a percentage
    if (options.isPercent === true) {
        data.forEach(function(d) {
            d._badgeAdderIsPercent = true;
        });
    }

    // Colors determined from the mask colors on the shields main site:
    // http://shields.io/
    var colors;
    if (options.valueRange !== undefined) {
        colors = d3.scale.quantize()
          .domain(options.valueRange)
          .range(['#4c1', '#97ca00', '#94a61d', '#dfb317', '#fe7d37', '#e05d44']);
    } else {
        colors = function() { return '#4c1'; };  // green
    }

    var addContent = function(titleTextWidth, contentWidth) {

        // Set the dimensions of the SVG and internal components based on the measured badge dimensions
        var titleSize = { width: titleTextWidth + 10, height: 20 };
        var contentBoxSize = { width: contentWidth + 10, height: 20 };
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
          .attr('fill', function(d) { return colors(d.value); });
        colorings.append('path')
          .attr('d', 'M 0 0 h ' + (titleSize.width + contentBoxSize.width) + 
                ' v ' + titleSize.height + ' H 0 z')
          .attr('fill', function(_, i) { return 'url(#gradient' + i + ')'; });

        var titleGroups = badgeRects.append('g')
          .attr('font-size', '11')
          .attr('font-family', 'DejaVu Sans,Verdana,Geneva,sans-serif')
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
          .attr('font-family', 'DejaVu Sans,Verdana,Geneva,sans-serif')
          .attr('text-anchor', 'left')
          .attr('fill', '#fff')
          .attr('transform', 'translate(' + titleSize.width + ',0)');

        if (options.fillContentFunc === undefined || options.displayValue) {
            contentGroups.append('text')
              .attr('class', 'content_text')
              .attr('fill-opacity', '.3')
              .attr('fill', '#010101')
              .attr('x', 4 + options.contentOffset)
              .attr('y', contentBoxSize.height - 4)
              .text(getDisplayValue);
            contentGroups.append('text')
              .attr('x', 4 + options.contentOffset)
              .attr('y', contentBoxSize.height - 5)
              .text(getDisplayValue);
        }
        if (options.fillContentFunc !== undefined) {
            options.fillContentFunc(contentGroups, contentBoxSize);
        }

        // Now that the badges have been added, return the finished SVG
        return callback(svg);

    };

    var titleTextWidth = measureTextWidth(titleText);
    var contentWidth = options.contentWidth;
    if (contentWidth === undefined) {
        contentWidth = measureTextWidth(getDisplayValue(data[0]));
    }
    contentWidth += options.contentPadding;
    addContent(titleTextWidth, contentWidth);

};

module.exports = {
    BadgeAdder: BadgeAdder
};
