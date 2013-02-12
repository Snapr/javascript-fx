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

// from http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript
function rgbToHsl(r, g, b){
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}

function hslToRgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r * 255, g * 255, b * 255];
}


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
            },
            hue: function(layer){
                // TODO
            },
            saturation: function(layer){

                var saturation = layer.adjustment.amount / 100;

                // Get the canvas image data
                var imageData = base.ctx.getImageData( 0, 0, base.canvas.width, base.canvas.height ),
                    data = imageData.data;

                // Apply the desaturation
                for ( var i = 0; i < data.length; i += 4 ) {
                    var hsl = rgbToHsl(data[i], data[i+1], data[i+2]);
                    var sat;
                    // adapted from https://github.com/jseidelin/pixastic/blob/master/actions/hsl.js
                    // claims to match photoshop but photoshop seems to ramp up exponentinally winth
                    // increasing saturation this does not. Photoshop +100 sat != 100% saturation
                    if (saturation < 0) {
                        sat = hsl[1] * (saturation + 1);
                    } else {
                        sat = hsl[1] * (saturation * 2 + 1);
                    }
                    // clip
                    if(sat > 255){
                        sat = 255;
                    }
                    var rgb = hslToRgb(hsl[0], sat, hsl[2]);
                    data[i] = rgb[0];
                    data[i+1] = rgb[1];
                    data[i+2] = rgb[2];
                }

                // Restore modified image data
                imageData.data = data;

                // Put the image data
                base.putImageData(imageData);

            },
            lightness: function(layer){
                // TODO
            },
            blur: function(layer){
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
        },
        'bran': {
            "name": "Bran",
            "slug": "bran",
            "layers": [
                {
                    "type": "adjustment",
                    "opacity": 100,
                    "blending_mode": "normal",
                    "mask_image": false,
                    "adjustment": {
                        "type": "curves",
                        "rgb": [],
                        "red": [[50,0],[51,16],[69,32],[85,58],[120,92],[186,140],[245,192],[255,255],[254,245]],
                        "green": [[0,0],[2,16],[18,32],[116,92],[182,128],[211,167],[227,192],[240,224],[252,255]],
                        "blue": [[48,0],[50,16],[77,62],[110,92],[144,128],[153,140],[180,167],[192,192],[217,224],[225,224],[225,255]]
                    }
                },
                {
                    "type": "adjustment",
                    "opacity": 100,
                    "blending_mode": "normal",
                    "mask_image": false,
                    "adjustment":
                     {
                        "type": "saturation",
                         "amount": -33
                      }
                },
                {
                    "type": "adjustment",
                    "opacity": 100,
                    "blending_mode": "normal",
                    "mask_image": "assets/bran-vignette.jpg",
                    "adjustment": {
                        "type": "curves",
                        "rgb": [[0,0],[34,42],[81,115],[139,184],[206,227],[255,255]],
                        "red": [],
                        "green": [],
                        "blue": []
                    }
                },
                {
                    "type": "image",
                    "opacity": 100,
                    "blending_mode": "normal",
                    "mask_image": false,
                    "image": {
                        "image": "assets/bran-frame.png",
                        "scale": true,
                        "top": 0,
                        "left": 0
                    }
                }
            ]
        },

        'goth': {
            "name": "Goth",
            "slug": "goth",
            "layers": [
            {
                "type": "adjustment",
                "opacity": 100,
                "blending_mode": "normal",
                "mask_image": false,
                "adjustment":
                 {
                    "type": "saturation",
                     "amount": -100
                  }
            },
            {
                "type": "adjustment",
                "opacity": 100,
                "blending_mode": "normal",
                "mask_image": false,
                "adjustment": {
                    "type": "curves",
                    "rgb": [[0,0],[255,176]],
                    "red": [[0,0],[3,16],[25,64],[40,92],[66,128],[83,140],[116,164],[165,192],[214,224],[234,240],[255,255]],
                    "green": [[0,0],[2,16],[19,64],[72,128],[165,192],[212,224],[252,255]],
                    "blue": [[0,0],[0,16],[23,64],[48,92],[88,128],[124,164],[151,192],[197,224],[225,255]]
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
