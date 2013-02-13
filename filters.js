// based on http://matthewruddy.github.com/jQuery-filter.me/
var Canvas = function(url){
    var base = this;
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.image = new Image();
    this.image.src = url;
    this.deferred = $.Deferred();
    this.image.onload = function() {

        // Set the canvas dimensions
        base.canvas.width = this.width;
        base.canvas.height = this.height;

        // Draw the image onto the canvas
        base.context.drawImage(this, 0, 0, this.width, this.height, 0, 0, base.canvas.width, base.canvas.height);

        base.deferred.resolve();
    };
};

Canvas.prototype.get_data = function(callback){
    return this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
};

Canvas.prototype.put_data = function(data) {
    this.context.putImageData(data, 0, 0);
    return this;
};

Canvas.prototype.get_data_url = function() {
    return this.canvas.toDataURL( 'image/jpeg', 1.0 );
};

var FX = function(url, effects){
    var fx = this;
    this.deferred = $.Deferred();
    this.canvas = new Canvas(url);
    this.canvas.deferred.done(function(){

        var data = fx.canvas.get_data(),
            pixels = data.data;

        $.each(effects.layers, function(i, layer){

            var filter = new filters[layer.type](layer);

            if(layer.mask_image){
                console.warn('image masks not implimented');
                //for now...
                for ( i = 0; i < pixels.length/2; i += 4 ) {
                    var rgb = filter.process(i, [pixels[i], pixels[i+1], pixels[i+2]]);
                    pixels[i  ] = rgb[0];
                    pixels[i+1] = rgb[1];
                    pixels[i+2] = rgb[2];
                }
            }else{
                for ( i = 0; i < pixels.length; i += 4 ) {
                    var rgb = filter.process(i, [pixels[i], pixels[i+1], pixels[i+2]]);
                    pixels[i  ] = rgb[0];
                    pixels[i+1] = rgb[1];
                    pixels[i+2] = rgb[2];
                }
            }
        });

        data.data = pixels;
        fx.canvas.put_data(data);
        fx.deferred.resolve();
    });
};

var filters = {};

filters.adjustment = function(layer){
    this.filter = new filters[layer.adjustment.type](layer);
    this.process = this.filter.process;
};

filters.curves = function(layer){
    this.curves = layer.adjustment;
    this.splines = {};

    var filter = this;

    $.each(['rgb', 'red', 'green', 'blue'], function(i, channel){

        // if not specified return a dummy function
        if(filter.curves[channel].length === 0){
            filter.splines[channel] = {interpolate: function(x){return x;}};
            return;
        }

        // convert from snapr currves spec format [[in1,out1],[in2,out2]]
        // to CubicSpline's input format [in1,in2], [out1,out2]
        var inputs = [], outputs = [];
        $.each(filter.curves[channel], function(i, point){
            inputs.push(point[1]);
            outputs.push(point[0]);
        });

        // create splines
        filter.splines[channel] = (new filter.CubicSpline(inputs, outputs));

    });
};
filters.curves.prototype.process = function(i, rgb){

    // Apply the curve to R, G, B values
    rgb[0] = this.filter.splines.red.interpolate(rgb[0]);
    rgb[1] = this.filter.splines.green.interpolate(rgb[1]);
    rgb[2] = this.filter.splines.blue.interpolate(rgb[2]);

    // Apply the overall RGB contrast changes
    rgb[0] = this.filter.splines.rgb.interpolate(rgb[0]);
    rgb[1] = this.filter.splines.rgb.interpolate(rgb[1]);
    rgb[2] = this.filter.splines.rgb.interpolate(rgb[2]);

    return rgb;
};
// CubicSplines based on http://blog.mackerron.com/2011/01/01/javascript-cubic-splines/
filters.curves.prototype.CubicSpline = function() {
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

filters.levels = function(layer){
    // TODO
    console.warn('levels not implimented');
};
filters.levels.prototype.process = function(i, rgb){ return rgb; };

filters.hsl = function(){};
// from http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript
filters.hsl.prototype.rgbToHsl = function(r, g, b){
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
};
filters.hsl.prototype.hslToRgb = function(h, s, l){
    var r, g, b;

    if(s === 0){
        r = g = b = l; // achromatic
    }else{
        function hue2rgb(p, q, t){
            if(t < 0){ t += 1; }
            if(t > 1){ t -= 1; }
            if(t < 1/6){ return p + (q - p) * 6 * t; }
            if(t < 1/2){ return q; }
            if(t < 2/3){ return p + (q - p) * (2/3 - t) * 6; }
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r * 255, g * 255, b * 255];
};

filters.hue = function(layer){
    // TODO
    console.warn('hue not implimented');
};
filters.hue.prototype = filters.hsl.prototype;
filters.hue.prototype.process = function(i, rgb){ return rgb; };

filters.saturation = function(layer){
    this.saturation = layer.adjustment.amount / 100;
};
//filters.saturation.prototype = filters.hsl.prototype;
filters.saturation.prototype.process = function(i, rgb){
    var hsl = filters.hsl.prototype.rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var sat;
    // adapted from https://github.com/jseidelin/pixastic/blob/master/actions/hsl.js
    // claims to match photoshop but photoshop seems to ramp up exponentinally winth
    // increasing saturation this does not. Photoshop +100 sat != 100% saturation
    if (this.filter.saturation < 0) {
        sat = hsl[1] * (this.filter.saturation + 1);
    } else {
        sat = hsl[1] * (this.filter.saturation * 2 + 1);
    }
    // clip
    if(sat > 255){
        sat = 255;
    }
    return filters.hsl.prototype.hslToRgb(hsl[0], sat, hsl[2]);
};

filters.lightness = function(layer){
    // TODO
    console.warn('lightness not implimented');
};
filters.lightness.prototype = filters.hsl.prototype;
filters.lightness.prototype.process = function(i, rgb){ return rgb; };

filters.blur = function(layer){
    // TODO
    console.warn('blur not implimented');
};
filters.blur.prototype.process = function(i, rgb){ return rgb; };

filters.color = function(layer){
    // TODO
    console.warn('color not implimented');
};
filters.color.prototype.process = function(i, rgb){ return rgb; };

filters.image = function(layer){
    // TODO
    console.warn('image not implimented');
};
filters.image.prototype.process = function(i, rgb){ return rgb; };


$.fn.snapr_fx = function(orig, filter_slug) {
    return this.each(function() {
        var element = $(this);
        var x = new FX(orig.attr('src'), filters_specs[filter_slug]);
        x.deferred.done(function(){
            element.attr('src', x.canvas.get_data_url());
        });
    });
};

var filters_specs = {
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
                "blue": [[28,0],[50,16],[77,62],[110,92],[144,128],[153,140],[180,167],[192,192],[217,224],[225,244],[225,255]]
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
        // {
        //             "type": "adjustment",
        //             "opacity": 100,
        //             "blending_mode": "normal",
        //             "mask_image": "assets/bran-vignette.jpg",
        //             "adjustment": {
        //                 "type": "curves",
        //                 "rgb": [[0,0],[34,42],[81,115],[139,184],[206,227],[255,255]],
        //                 "red": [],
        //                 "green": [],
        //                 "blue": []
        //             }
        //         },
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
                "blue": [[0,0],[1,16],[23,64],[48,92],[88,128],[124,164],[151,192],[197,224],[225,255]]
            }
        }
        ]
    }
}
