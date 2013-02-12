// CubicSplines based on http://blog.mackerron.com/2011/01/01/javascript-cubic-splines/
var CubicSpline = function() {
  function CubicSpline(x, a) {
    var b, c, d, h, i, k, l, n, s, u, y, z, _ref;
    if (!((x !== null) && (a !== null))) {
      return;
    }
    n = x.length - 1;
    h = [];
    y = [];
    l = [];
    u = [];
    z = [];
    c = [];
    b = [];
    d = [];
    k = [];
    s = [];
    this.max_out = a[0];
    for (i = 0; (0 <= n ? i < n : i > n); (0 <= n ? i += 1 : i -= 1)) {
      h[i] = x[i + 1] - x[i];
      k[i] = a[i + 1] - a[i];
      s[i] = k[i] / h[i];
      this.max_out = a[i+1] > this.max_out ? a[i+1] : this.max_out ;
    }
    for (i = 1; (1 <= n ? i < n : i > n); (1 <= n ? i += 1 : i -= 1)) {
      y[i] = 3 / h[i] * (a[i + 1] - a[i]) - 3 / h[i - 1] * (a[i] - a[i - 1]);
    }
    l[0] = 1;
    u[0] = 0;
    z[0] = 0;
    for (i = 1; (1 <= n ? i < n : i > n); (1 <= n ? i += 1 : i -= 1)) {
      l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * u[i - 1];
      u[i] = h[i] / l[i];
      z[i] = (y[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    l[n] = 1;
    z[n] = 0;
    c[n] = 0;
    for (i = _ref = n - 1; (_ref <= 0 ? i <= 0 : i >= 0); (_ref <= 0 ? i += 1 : i -= 1)) {
      c[i] = z[i] - u[i] * c[i + 1];
      b[i] = (a[i + 1] - a[i]) / h[i] - h[i] * (c[i + 1] + 2 * c[i]) / 3;
      d[i] = (c[i + 1] - c[i]) / (3 * h[i]);
    }
    this.x = x.slice(0, n + 1);
    this.a = a.slice(0, n);
    this.b = b;
    this.c = c.slice(0, n);
    this.d = d;
  }
  CubicSpline.prototype.derivative = function() {
    var c, d, s, x, _i, _j, _len, _len2, _ref, _ref2, _ref3;
    s = new this.constructor();
    s.x = this.x.slice(0, this.x.length);
    s.a = this.b.slice(0, this.b.length);
    _ref = this.c;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      c = _ref[_i];
      s.b = 2 * c;
    }
    _ref2 = this.d;
    for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
      d = _ref2[_j];
      s.c = 3 * d;
    }
    for (x = 0, _ref3 = this.d.length; (0 <= _ref3 ? x < _ref3 : x > _ref3); (0 <= _ref3 ? x += 1 : x -= 1)) {
      s.d = 0;
    }
    return s;
  };
  CubicSpline.prototype.interpolate = function(x) {
    var deltaX, i, y, _ref;
    for (i = _ref = this.x.length - 1; (_ref <= 0 ? i <= 0 : i >= 0); (_ref <= 0 ? i += 1 : i -= 1)) {
      if (this.x[i] <= x) {
        break;
      }
    }
    deltaX = x - this.x[i];
    y = this.a[i] + this.b[i] * deltaX + this.c[i] * Math.pow(deltaX, 2) + this.d[i] * Math.pow(deltaX, 3);
    return isNaN(y) ? this.max_out : y;
  };
  return CubicSpline;
}();


// based on http://matthewruddy.github.com/jQuery-filter.me/
(function($) {

    /*
     * Main plugin object
     */
    $.filterMe = function(el, filter_slug) {

        var base = this,
            filter,
            o;

        // Store the jQuery element and create canvas element
        base.$el = $(el);
        base.canvas = document.createElement('canvas');
        base.ctx = base.canvas.getContext('2d');
        base.url = '';

        /*
         * Initiate filter
         */
        base._init = function() {

            // Get the filter (from the images data-filter attribute)
            filter = $.filterMe.filters[ filter_slug ] || false;

            // Get the options
            o = base.options = $.extend({}, filter);

            // Trigger actions
            base.$el.trigger('fitlerIO._init', base);

            // Begin the process
            base.process();

        };

        /*
         * Processes and image and applies the effects
         */
        base.process = function() {

            // Check for canvas support before continuing
            if ( !base.canvas.getContext ){
                return;
            }

            // Let's go!
            var image = new Image();

            // Get image src and load it
            image.src = base.$el.attr('src');
            image.onload = function() {

                // Set the canvas dimensions
                base.canvas.width = this.width;
                base.canvas.height = this.height;

                // Draw the image onto the canvas
                base.ctx.drawImage( this, 0, 0, this.width, this.height, 0, 0, base.canvas.width, base.canvas.height );

                // Trigger beginning action
                base.$el.trigger('filterMe.processBegin', base);

                $.each(o.layers, function(i, layer){
                    base.layers[layer.type](layer);
                });

                // Get the output URL globally (for ease of access)
                base.url = base.outputURL();

                // Output the image!
                base.outputImage();

                // Processing finished action
                base.$el.trigger('filterMe.processEnd', base);

            };

        };

        base.layers = {
            adjustment: function(layer){
                base.adjustments[layer.adjustment.type](layer);
            },
            color: function(layer){
                // TODO
            },
            image: function(layer){
                // TODO
            }
        };

        base.adjustments = {
            curves: function(layer){
                var i,
                curves = layer.adjustment,
                    splines = {};

                $.each(['rgb', 'red', 'green', 'blue'], function(i, channel){

                    // if not specified return a dummy function
                    if(curves[channel].length === 0){
                        splines[channel] = {interpolate: function(x){return x;}};
                        return;
                    }

                    // convert from snapr currves spec format [[in1,out1],[in2,out2]]
                    // to CubicSpline's input format [in1,in2], [out1,out2]
                    var inputs = [], outputs = [];
                    $.each(curves[channel], function(i, point){
                        inputs.push(point[1]);
                        outputs.push(point[0]);
                    });

                    // create splines
                    splines[channel] = (new CubicSpline(inputs, outputs));

                });

                // Get the canvas image data
                var imageData = base.ctx.getImageData( 0, 0, base.canvas.width, base.canvas.height ),
                    data = imageData.data,
                    length = data.length;

                // Apply the color R, G, B values to each individual pixel
                for ( i = 0; i < length; i += 4 ) {
                    data[i] = splines.red.interpolate(data[i]);
                    data[i+1] = splines.green.interpolate(data[i+1]);
                    data[i+2] = splines.blue.interpolate(data[i+2]);
                }

                // Apply the overall RGB contrast changes to each pixel
                for ( i = 0; i < length; i += 4 ) {
                    data[i] = splines.rgb.interpolate(data[i]);
                    data[i+1] = splines.rgb.interpolate(data[i+1]);
                    data[i+2] = splines.rgb.interpolate(data[i+2]);
                }

                // Restore modified image data
                imageData.data = data;

                // Put the image data
                base.putImageData(imageData);
            },
            levels: function(layer){
                // TODO
            }
        };

        /*
         * Applies the image data (for example, after pixel maniupulation)
         */
        base.putImageData = function(imageData) {
            base.ctx.putImageData( imageData, 0, 0 );
        };

        /*
         * Outputs the image URL
         */
        base.outputURL = function() {
            var url = base.canvas.toDataURL( 'image/jpeg', 1.0 );
            base.$el.trigger('filterMe.outputURL', url);
            return url;
        };

        /*
         * Outputs the image to the original Image src
         */
        base.outputImage = function() {
            base.$el.trigger('filterMe.outputImage');
            base.$el.attr('src', base.url);
        };

        // Store the data for external usages
        base.$el.data('filterMe', base);

        // Let's begin!
        base._init();

    };

    /*
     * Sets the filters
     */
    $.filterMe.filters = {

        kv: {
            "name": "KV",
            "slug": "kv",
            "layers": [
            {
                "type": "adjustment",
                "opacity": 100,
                "blending_mode": "normal",
                "mask_image": false,
                "adjustment": {
                    "type": "curves",
                    "rgb": [],
                    "red": [[43,0],[93,32],[189,92],[245,192],[254,255]],
                    "green": [[36,0],[45,32],[79,64],[146,128],[184,192],[195,255]],
                    "blue": [[69,0],[71,64],[117,192],[124,255]]
                }
            }
        ]
        },
        'nash': {
            "name": "Nash",
            "slug": "nash",
            "layers": [
            {
                "type": "adjustment",
                "opacity": 100,
                "blending_mode": "normal",
                "mask_image": false,
                "adjustment": {
                    "type": "curves",
                    "rgb": [],
                    "red": [[56,0],[56,29],[93,64],[152,92],[214,140],[245,192],[255,240],[255,255]],
                    "green": [[38,0],[49,16],[111,64],[148,92],[188,140],[212,192],[221,240],[221,255]],
                    "blue": [[97,0],[117,31],[144,92],[158,128],[165,165],[175,240]]
                }
            }
            ]
        }
    };

    /*
     * jQuery plugin
     */
    $.fn.filterMe = function(filter_slug) {
        return this.each(function() {
            new $.filterMe(this, filter_slug);
        });
    };

})(jQuery);
