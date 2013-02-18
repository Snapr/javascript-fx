// based on http://matthewruddy.github.com/jQuery-filter.me/
var Canvas = function(url, width, height){
    var base = this;
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.image = new Image();
    this.image.src = url;
    this.deferred = $.Deferred();
    this.image.onload = function() {

        base.width = base.canvas.width = width || this.width;
        base.height = base.canvas.height = height || this.height;

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

var FX = function(url, effects, asset_prefix){
    console.group(effects.name);
    var fx = this;
    this.effects = effects;
    this.layer_index = -1;  // so next layer is 0
    this.asset_prefix = asset_prefix || '';
    this.deferred = $.Deferred();
    this.canvas = new Canvas(url);
    this.canvas.deferred.done(function(){
        fx.data = fx.canvas.get_data();
        fx.pixels = fx.data.data;
        fx.apply_next_layer();
    });
};
FX.prototype.apply_next_layer = function(){
    this.layer_index++;
    if(this.layer_index >= this.effects.layers.length){
        this.finish();
        return;
    }

    console.log("applying", this.effects.layers[this.layer_index].type, "layer");

    var fx = this,
        layer = this.effects.layers[this.layer_index],
        filter = new filters[layer.type](layer, fx),
        blend = blend_modes[layer.blending_mode || 'normal'];

    // when the filter is ready
    filter.deferred.done(function(){

        if(layer.mask_image){
            var mask = new Canvas(fx.asset_prefix+layer.mask_image, fx.canvas.width, fx.canvas.height);
            mask.deferred.done(function(){
                var mask_pixels = mask.get_data().data;
                for ( var i = 0; i < fx.pixels.length; i += 4 ) {
                    var rgb = filter.process(i, [fx.pixels[i], fx.pixels[i+1], fx.pixels[i+2]]);
                    var opacity = rgb[3];
                    if(opacity >= 0){
                        opacity = opacity / 255;
                    }else{
                        opacity = 1;
                    }
                    opacity = opacity * (mask_pixels[i]/255);
                    fx.pixels[i  ] = blend(fx.pixels[i  ], rgb[0], opacity);
                    fx.pixels[i+1] = blend(fx.pixels[i+1], rgb[1], opacity);
                    fx.pixels[i+2] = blend(fx.pixels[i+2], rgb[2], opacity);
                }
                fx.apply_next_layer();
            });
        }else{
            for ( var i = 0; i < fx.pixels.length; i += 4 ) {
                var rgb = filter.process(i, [fx.pixels[i], fx.pixels[i+1], fx.pixels[i+2]]);
                var opacity = rgb[3];
                if(opacity >= 0){
                    opacity = opacity / 255;
                }else{
                    opacity = 1;
                }
                fx.pixels[i  ] = blend(fx.pixels[i  ], rgb[0], opacity);
                fx.pixels[i+1] = blend(fx.pixels[i+1], rgb[1], opacity);
                fx.pixels[i+2] = blend(fx.pixels[i+2], rgb[2], opacity);
            }
            fx.apply_next_layer();
        }
    });
};
FX.prototype.finish = function(){
    this.data.data = this.pixels;
    this.canvas.put_data(this.data);
    this.deferred.resolve();

    console.groupEnd(this.effects.name);
};

var filters = {};

filters.adjustment = function(layer){
    console.log(" - ", layer.adjustment.type);

    this.filter = new filters[layer.adjustment.type](layer);
    this.process = this.filter.process;
    this.deferred = $.Deferred().resolve();
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
    this.hue = layer.adjustment.amount;
};
filters.hue.prototype = filters.hsl.prototype;
filters.hue.prototype.process = function(i, rgb){
    var hsl = filters.hsl.prototype.rgbToHsl(rgb[0], rgb[1], rgb[2]);
    hsl[0] += this.filter.hue;
    if(hsl[0]>255){
        hsl[0] -= 255;
    }
    return filters.hsl.prototype.hslToRgb(hsl[0], hsl[1], hsl[2]);
};

filters.saturation = function(layer){
    this.saturation = layer.adjustment.amount / 100;
};
//filters.saturation.prototype = filters.hsl.prototype;
filters.saturation.prototype.process = function(i, rgb){
    var hsl = filters.hsl.prototype.rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var sat;
    // adapted from https://github.com/jseidelin/pixastic/blob/master/actions/hsl.js
    // claims to match photoshop but photoshop seems to ramp up exponentinally with
    // increasing saturation and this does not. Photoshop +100 sat != 100% saturation
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
    this.lightness = layer.adjustment.amount / 100;
};
filters.lightness.prototype = filters.hsl.prototype;
filters.lightness.prototype.process = function(i, rgb){
    var hsl = filters.hsl.prototype.rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var lightness;
    if (this.filter.lightness < 0) {
        lightness = hsl[2] * (this.filter.lightness + 1);
    } else {
        lightness = hsl[2] * (this.filter.lightness * 2 + 1);
    }
    // clip
    if(lightness > 255){
        lightness = 255;
    }
    return filters.hsl.prototype.hslToRgb(hsl[0], hsl[1], lightness);
};

filters.blur = function(layer){
    // TODO
    console.warn('blur not implimented');
};
filters.blur.prototype.process = function(i, rgb){ return rgb; };

filters.color = function(layer){
    this.color = layer.color.rgb;
    this.deferred = $.Deferred().resolve();
};
filters.color.prototype.process = function(i, rgb){ return this.color; };

filters.image = function(layer, fx){
    this.url = layer.image.image;
    this.width = fx.canvas.width;
    this.height = fx.canvas.height;
    this.canvas = new Canvas(fx.asset_prefix+this.url, this.width, this.height);
    this.deferred = $.Deferred();
    var image_filter = this;
    this.canvas.deferred.done(function(){
        image_filter.data = image_filter.canvas.get_data();
        image_filter.pixels = image_filter.data.data;
        image_filter.deferred.resolve();
    });
};
filters.image.prototype.process = function(i, rgb){
    return [this.pixels[i], this.pixels[i+1], this.pixels[i+2], this.pixels[i+3]];
};

var blend_modes = {
    normal: function(orig, overlay, opacity){
        return overlay * opacity + orig * (1 - opacity);
    },
    multiply: function(orig, overlay, opacity){
        overlay = orig * overlay / 255;
        return blend_modes.normal(orig, overlay, opacity);
    },
    screen: function(orig, overlay, opacity){
        overlay = (255 - ( ((255-overlay)*(255-orig)) >> 8));
        return blend_modes.normal(orig, overlay, opacity);
    },
    overlay: function(orig, overlay, opacity){
        if (orig < 128){
            overlay = orig*overlay*(2 / 255);
        }
        else{
            overlay = 255 - (255-orig)*(255-overlay)*(2 / 255);
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    darken: function(orig, overlay, opacity){
        if(orig < overlay){
            overlay = orig;
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    lighten: function(orig, overlay, opacity){
        if(orig > overlay){
            overlay = orig;
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    color_dodge: function(orig, overlay, opacity){
        var x = (orig<<8)/(255-overlay);
        if (x > 255 || overlay == 255){
            overlay = 255;
        }else{
            overlay = x;
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    color_burn: function(orig, overlay, opacity){
        var x = 255-((255-orig)<<8)/overlay;
        if (x < 0 || overlay === 0){
            overlay = 0;
        }else{
            overlay = x;
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    soft_light: function(orig, overlay, opacity){
        if (orig < 128){
            overlay = ((overlay>>1) + 64) * orig * (2/255);
        }else{
            overlay = 255 - (191 - (overlay>>1)) * (255-orig) * (2/255);
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    hard_light: function(orig, overlay, opacity){
        if (overlay < 128){
            overlay = orig * overlay * (2/255);
        }else{
            overlay = 255 - (255-orig) * (255-overlay) * (2/255);
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    difference: function(orig, overlay, opacity){
        var x = orig - overlay;
        if (x < 0){
            overlay = -x;
        }else{
            overlay = x;
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    exclusion: function(orig, overlay, opacity){
        overlay = orig - (orig * (2/255) - 1) * overlay;
        return blend_modes.normal(orig, overlay, opacity);
    },
    hue: function(orig, overlay, opacity){
        return blend_modes.normal(orig, overlay, opacity);
    },
    saturation: function(orig, overlay, opacity){
        return blend_modes.normal(orig, overlay, opacity);
    },
    color: function(orig, overlay, opacity){
        return blend_modes.normal(orig, overlay, opacity);
    },
    luminosity: function(orig, overlay, opacity){
        return blend_modes.normal(orig, overlay, opacity);
    },
    subtract: function(orig, overlay, opacity){
        overlay = orig - overlay;
        if(overlay < 0){
            overlay = 0;
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    add: function(orig, overlay, opacity){
        overlay = orig + overlay;
        if(overlay > 255){
            overlay = 255;
        }
        return blend_modes.normal(orig, overlay, opacity);
    },
    divide: function(orig, overlay, opacity){
        overlay = (orig / overlay) * 255;
        return blend_modes.normal(orig, overlay, opacity);
    },
    linear_burn: function(orig, overlay, opacity){
        if ((orig + overlay) < 255){
            overlay = 0;
        }else{
            overlay = (orig + overlay - 255);
        }
        return blend_modes.normal(orig, overlay, opacity);
    }
};


$.fn.snapr_fx = function(orig, pack, filter_slug) {
    var elements = this;
    $.ajax({
        url: 'filter-packs/'+pack+'/filters/' + filter_slug + '/filter.json',
        success: function(data){
            elements.each(function() {
                var element = $(this);
                var x = new FX(orig.attr('src'), data.filter, 'filter-packs/zombies/filters/' + filter_slug + '/');
                x.deferred.done(function(){
                    element.attr('src', x.canvas.get_data_url());
                });
            });
        }
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
            "blending_mode": "multiply",
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
                    "mask_image": "bran-vignette.jpg",
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
                "image": "bran-frame.png",
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
