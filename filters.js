/*jslint bitwise: true */


// Overview
// --------

// Load image into canvas
// For each layer in effect
//     If the filter can operate on the whole Canvas
//         Put the px back on the canvas
//         Run the filter
//     If the filter runs px by px
//         Run the filter on each px

//     Create a blender to mix the results with the underlying image using the right blend mode
//         take into account overall layer opacity, px opacity from filter and opacity from mask

// put the px back on the canvas
// return data url



var r=0,g=1,b=2,o=3;

var SnaprFX = {};


// Core object - actually applies the effects to the image
SnaprFX.FX = function(url, effects, asset_prefix){
    console.group(effects.name);
    var fx = this;
    this.effects = effects;
    this.layer_index = -1;  // so first time we call 'next' layer it's 0
    this.asset_prefix = asset_prefix || '';  // path prefix for masks, images
    this.deferred = $.Deferred();
    this.canvas = new SnaprFX.Canvas(url);
    this.canvas.deferred.done(function(){
        fx.pixels = fx.canvas.get_data();
        fx.apply_next_layer();
    });
};
SnaprFX.FX.prototype.apply_next_layer = function(){
    // apply_next_layer allows processing to be deffered until something is ready (eg, loading mask image)
    // after this layer is finished apply_next_layer will be called again

    this.layer_index++;
    // if there are no more laters we are done!
    if(this.layer_index >= this.effects.layers.length){
        this.finish();
        return;
    }

    console.time("applying " + this.effects.layers[this.layer_index].type + " layer");

    console.log("applying", this.effects.layers[this.layer_index].type, "layer");

    var fx = this,
        layer = this.effects.layers[this.layer_index],
        filter = new SnaprFX.filters[layer.type](layer, fx),
        blender = new SnaprFX.Blender(layer.blending_mode || 'normal');

    // when the filter is ready (may need to load an image etc)
    filter.deferred.done(function(){

        // some filters (eg blur) need the whole canvas - they can't work px by px
        var whole_canvas_result;
        if(filter.whole_canvas){
            // put modified px back on canvas (not needed if this is the first layer)
            if(this.layer_index !== 0){
                fx.canvas.put_data(fx.pixels);
            }

            // run the filter
            filter.process(fx.canvas);

            whole_canvas_result = fx.canvas.get_data();
        }

        // if there's a mask we must adjust each of the new px opacity accordingly
        if(layer.mask_image){

            var mask = new SnaprFX.Canvas(fx.asset_prefix+layer.mask_image, fx.canvas.width, fx.canvas.height);
            mask.deferred.done(function(){

                var mask_pixels = mask.get_data();

                for ( var i = 0; i < fx.pixels.length; i += 4 ) {

                    var rgb;
                    if(filter.whole_canvas){
                        // whole canvas has been processed by filter
                        // get relivent px
                        rgb = [whole_canvas_result[i], whole_canvas_result[i+1], whole_canvas_result[i+2], whole_canvas_result[i+3]];
                    }else{
                        // process this px now
                        rgb = filter.process(i, [fx.pixels[i], fx.pixels[i+1], fx.pixels[i+2]]);
                    }

                    // start with opacity for px returned by filter
                    var opacity = rgb[o];
                    if(opacity >= 0){  // >= 0 ensures a number (that's positive too)
                        opacity = opacity / 255;
                    }else{
                        opacity = 1;
                    }
                    // * opacity of this px from mask
                    opacity = opacity * (mask_pixels[i]/255);
                    // * opacity of this whole layer
                    opacity = opacity * (layer.opacity/100);

                    rgb = blender.process(
                        [fx.pixels[i], fx.pixels[i+1], fx.pixels[i+2]],
                        [rgb[r], rgb[g], rgb[b]],
                        opacity
                    );
                    fx.pixels[i  ] = rgb[r];
                    fx.pixels[i+1] = rgb[g];
                    fx.pixels[i+2] = rgb[b];
                }

                console.timeEnd("applying " + fx.effects.layers[fx.layer_index].type + " layer");
                fx.apply_next_layer();
            });
        }else{

            if(filter.whole_canvas){
                // set px to result px one by one, setting fx.pixels = whole_canvas_result fails ??!
                for ( var px = 0; px < fx.pixels.length; px++ ) {
                    fx.pixels[px] = whole_canvas_result[px];
                }
            }else{
                for ( var i = 0; i < fx.pixels.length; i += 4 ) {

                    var rgb = filter.process(i, [fx.pixels[i], fx.pixels[i+1], fx.pixels[i+2]]);

                    var opacity = rgb[o];
                    if(opacity >= 0){  // >=0 ensures a number, not undefined
                        opacity = opacity / 255;
                    }else{
                        opacity = 1;
                    }
                    opacity = opacity * (layer.opacity/100);

                    rgb = blender.process(
                        [fx.pixels[i], fx.pixels[i+1], fx.pixels[i+2]],
                        [rgb[r], rgb[g], rgb[b]],
                        opacity
                    );
                    fx.pixels[i  ] = rgb[r];
                    fx.pixels[i+1] = rgb[g];
                    fx.pixels[i+2] = rgb[b];
                }
            }

            console.timeEnd("applying " + fx.effects.layers[fx.layer_index].type + " layer");
            fx.apply_next_layer();
        }
    });
};
SnaprFX.FX.prototype.finish = function(){
    // put px back in canvas

    console.time('writing data back');

    this.canvas.put_data(this.pixels);
    this.deferred.resolve();

    console.timeEnd('writing data back');

    console.groupEnd(this.effects.name);
};


// Utilities
// ---------

SnaprFX.utils = {
    // based on http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript
    rgbToHsl: function(r, g, b){
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
    },
    hslToRgb: function(h, s, l){
        var r, g, b;

        if(s === 0){
            r = g = b = l; // achromatic
        }else{
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = SnaprFX.utils.hueToRgb(p, q, h + 1/3);
            g = SnaprFX.utils.hueToRgb(p, q, h);
            b = SnaprFX.utils.hueToRgb(p, q, h - 1/3);
        }

        return [r * 255, g * 255, b * 255];
    },
    hueToRgb: function(p, q, t){
        if(t < 0){ t += 1; }
        if(t > 1){ t -= 1; }
        if(t < 1/6){ return p + (q - p) * 6 * t; }
        if(t < 1/2){ return q; }
        if(t < 2/3){ return p + (q - p) * (2/3 - t) * 6; }
        return p;
    }
};


// Canvas
// ------

// gets an image file and reads its pixels
// based on http://matthewruddy.github.com/jQuery-filter.me/
SnaprFX.Canvas = function(url, width, height){
    console.time('get image');

    var base = this;
    this.deferred = $.Deferred();  // to notify when read to read

    // create canvas
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');

    // get image
    this.image = new Image();
    this.image.src = url;

    this.image.onload = function() {

        // scale canvas to image size if none specified
        base.width = base.canvas.width = width || this.width;
        base.height = base.canvas.height = height || this.height;

        // Draw the image onto the canvas
        base.context.drawImage(this, 0, 0, this.width, this.height, 0, 0, base.canvas.width, base.canvas.height);

        // notify that it's ready
        base.deferred.resolve();

        console.timeEnd('get image');
    };
};

SnaprFX.Canvas.prototype.get_data = function(){
    var image_data = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    // if you ever overwrite this it seems you can't write the px back to the canvas
    this.data = this.data || image_data;
    return image_data.data;
};

SnaprFX.Canvas.prototype.put_data = function(data) {
    this.data.data = data;
    this.context.putImageData(this.data, 0, 0);
    return this;
};

SnaprFX.Canvas.prototype.get_data_url = function() {
    return this.canvas.toDataURL( 'image/jpeg', 1.0 );
};


// Blender
// -------

// Blends two layers together
SnaprFX.Blender = function(mode){
    console.log(' - Blend:', mode);

    this.mode = this.blend_modes[mode];

    // does this blend mode require all RGB values
    if(this.mode.rgb){
        this.process = function(orig, overlay, opacity){

            // the the blended result
            overlay = this.mode.process(orig, overlay);

            // apply it to the underlying layer with opacity
            var mix = [];
            for (var channel = r; channel <= b; channel++) {
                mix[channel] = overlay[channel] * opacity + orig[channel] * (1 - opacity);
            }
            return mix;
        };
    // or can it work with the channels individually
    }else{
        this.process = function(orig, overlay, opacity){
            var mix = [];
            for (var channel = r; channel <= b; channel++) {
                mix[channel] = this.mode.process(orig[channel], overlay[channel]);
                mix[channel] = mix[channel] * opacity + orig[channel] * (1 - opacity);
            }
            return mix;
        };
    }
};

SnaprFX.Blender.prototype.blend_modes = {
    normal: {
        rgb: false,
        process: function(orig, overlay, opacity){ return overlay; }
    },

    multiply: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return orig * overlay / 255;
        }
    },

    screen: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return 255 - ( ((255-overlay)*(255-orig)) >> 8);
        }
    },

    overlay: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if (orig < 128){
                return orig*overlay*(2 / 255);
            }else{
                return 255 - (255-orig)*(255-overlay)*(2 / 255);
            }
        }
    },

    darken: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if(orig < overlay){
                overlay = orig;
            }
            return overlay;
        }
    },

    lighten: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if(orig > overlay){
                overlay = orig;
            }
            return overlay;
        }

    },
    color_dodge: {
        rgb: false,
        process: function(orig, overlay, opacity){
            var x = (orig<<8)/(255-overlay);
            if (x > 255 || overlay == 255){
                return 255;
            }else{
                return x;
            }
        }
    },

    color_burn: {
        rgb: false,
        process: function(orig, overlay, opacity){
            var x = 255-((255-orig)<<8)/overlay;
            if (x < 0 || overlay === 0){
                return 0;
            }else{
                return x;
            }
        }
    },

    soft_light: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if (orig < 128){
                return ((overlay>>1) + 64) * orig * (2/255);
            }else{
                return 255 - (191 - (overlay>>1)) * (255-orig) * (2/255);
            }
        }
    },

    hard_light: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if (overlay < 128){
                return orig * overlay * (2/255);
            }else{
                return 255 - (255-orig) * (255-overlay) * (2/255);
            }
        }
    },

    difference: {
        rgb: false,
        process: function(orig, overlay, opacity){
            var x = orig - overlay;
            if (x < 0){
                return -x;
            }else{
                return x;
            }
        }
    },

    exclusion: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return orig - (orig * (2/255) - 1) * overlay;
        }
    },

    hue: {
        rgb: true,
        process: function(orig, overlay, opacity){
            return overlay;
        }
    },

    saturation: {
        rgb: true,
        process: function(orig, overlay, opacity){
            return overlay;
        }
    },

    color: {
        rgb: true,
        process: function(orig, overlay, opacity){
            var orig_hsb = SnaprFX.utils.rgbToHsl(orig[0], orig[1], orig[2]),
                overlay_hsb = SnaprFX.utils.rgbToHsl(overlay[0], overlay[1], overlay[2]);

            return SnaprFX.utils.hslToRgb(overlay_hsb[0], overlay_hsb[1], orig_hsb[2]);
        }
    },

    luminosity: {
        rgb: true,
        process: function(orig, overlay, opacity){
            return overlay;
        }
    },

    subtract: {
        rgb: false,
        process: function(orig, overlay, opacity){
            overlay = orig - overlay;
            if(overlay < 0){
                overlay = 0;
            }
            return overlay;
        }
    },

    add: {
        rgb: false,
        process: function(orig, overlay, opacity){
            overlay = orig + overlay;
            if(overlay > 255){
                overlay = 255;
            }
            return overlay;
        }
    },

    divide: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return (orig / overlay) * 255;
        }

    },
    linear_burn: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if ((orig + overlay) < 255){
                return 0;
            }else{
                return (orig + overlay - 255);
            }
        }
    }
};

SnaprFX.filters = {};

SnaprFX.filters.adjustment = function(layer){
    // adjustment layer is just a wrapper for real adjustment type
    console.log(" - Adjustment:", layer.adjustment.type);

    this.filter = new SnaprFX.filters[layer.adjustment.type](layer);
    this.whole_canvas = this.filter.whole_canvas;
    this.process = this.filter.process;
    this.deferred = $.Deferred().resolve();
};

SnaprFX.filters.curves = function(layer){
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
SnaprFX.filters.curves.prototype.process = function(i, rgb){

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
SnaprFX.filters.curves.prototype.CubicSpline = function() {
    // CubicSplines based on http://blog.mackerron.com/2011/01/01/javascript-cubic-splines/

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
        this.min_out = a[0];
        for (i = 0; (0 <= n ? i < n : i > n); (0 <= n ? i += 1 : i -= 1)) {
          h[i] = x[i + 1] - x[i];
          k[i] = a[i + 1] - a[i];
          s[i] = k[i] / h[i];
          this.max_out = a[i+1] > this.max_out ? a[i+1] : this.max_out ;
          this.min_out = a[i+1] < this.min_out ? a[i+1] : this.min_out ;
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
        if(isNaN(y)){
            return x < this.max_out ? this.min_out : this.max_out;
        }else{
            return y;
        }
    };

    return CubicSpline;
}();


SnaprFX.filters.levels = function(layer){
    var levels = layer.adjustment;
    this.interpolate = function(x){

        // map input values to a curve that runs from (0,black) to (255,white)
        // mid is gamma, it affects the curvatiure - map all values on the line
        // to the range 0-1 and raise them to the power of the gamma value

        var range = levels.white - levels.black,
            slope = range/255,
            gamma = levels.mid,
            min = levels.black;

        return (Math.pow(((x-min) / range),(1/gamma)) * range)/slope;
    };
};
SnaprFX.filters.levels.prototype.process = function(i, rgb){

    rgb[r] = this.filter.interpolate(rgb[r]);
    rgb[g] = this.filter.interpolate(rgb[g]);
    rgb[b] = this.filter.interpolate(rgb[b]);

    return rgb;
};

SnaprFX.filters.hue = function(layer){
    this.hue = layer.adjustment.amount;
};
SnaprFX.filters.hue.prototype.process = function(i, rgb){

    var hsl = SnaprFX.utils.rgbToHsl(rgb[r], rgb[g], rgb[b]);
    hsl[0] += this.filter.hue/255;

    // keep in range 0 to 1 by wrapping (1.6 => .6)
    if(hsl[0]>1){
        hsl[0] -= 1;
    }
    if(hsl[0]<0){
        hsl[0] += 1;
    }

    return SnaprFX.utils.hslToRgb(hsl[0], hsl[1], hsl[2]);
};

SnaprFX.filters.saturation = function(layer){
    this.saturation = layer.adjustment.amount / 100;
};
SnaprFX.filters.saturation.prototype.process = function(i, rgb){
    // adapted from https://github.com/jseidelin/pixastic/blob/master/actions/hsl.js
    // claims to match photoshop but photoshop seems to ramp up exponentinally with
    // increasing saturation and this does not. Photoshop +100 sat != 100% saturation

    var hsl = SnaprFX.utils.rgbToHsl(rgb[r], rgb[g], rgb[b]);
    var sat;  // sat valur for this px

    if (this.filter.saturation < 0) {
        sat = hsl[1] * (this.filter.saturation + 1);
    } else {
        sat = hsl[1] * (this.filter.saturation * 2 + 1);
    }

    // clip
    sat = Math.max(255, sat);

    return SnaprFX.utils.hslToRgb(hsl[0], sat, hsl[2]);
};

SnaprFX.filters.lightness = function(layer){
    this.lightness = layer.adjustment.amount / 100;
};
SnaprFX.filters.lightness.prototype.process = function(i, rgb){

    var hsl = SnaprFX.utils.rgbToHsl(rgb[r], rgb[g], rgb[b]);
    var lightness;  // l value for this px

    if (this.filter.lightness < 0) {
        lightness = hsl[2] * (this.filter.lightness + 1);
    } else {
        lightness = hsl[2] * (this.filter.lightness * 2 + 1);
    }

    // clip
    lightness = Math.max(255, lightness);

    return SnaprFX.utils.hslToRgb(hsl[0], hsl[1], lightness);
};

SnaprFX.filters.blur = function(layer){
    // this filter needs the whole canvas, it can't work px by px
    this.whole_canvas = true;
    // amount must be 0-5
    this.amount = Math.max(0, Math.min(5, layer.adjustment.amount));

};
SnaprFX.filters.blur.prototype.process = function(canvas){

    // blur image by scaling it down and back up a few times
    // based on http://www.pixastic.com/lib/git/pixastic/actions/blurfast.js

    var scale = 2;
    var smallWidth = Math.round(canvas.width / scale);
    var smallHeight = Math.round(canvas.height / scale);

    var copy = document.createElement("canvas");
    copy.width = smallWidth;
    copy.height = smallHeight;

    var steps = Math.round(this.filter.amount * 20);

    var copy_context = copy.getContext("2d");
    for (var i=0; i<steps; i++) {
        var scaledWidth = Math.max(1, Math.round(smallWidth - i));
        var scaledHeight = Math.max(1, Math.round(smallHeight - i));

        copy_context.clearRect(0,0,smallWidth,smallHeight);

        copy_context.drawImage(
            canvas.canvas,
            0, 0, canvas.width, canvas.height,
            0, 0, scaledWidth, scaledHeight
        );

        canvas.context.drawImage(
            copy,
            0, 0, scaledWidth, scaledHeight,
            0, 0, canvas.width, canvas.height
        );
    }

};

// flat color layer
SnaprFX.filters.color = function(layer){
    // TODO: if mask == false we can use canvas.context.fillRect to do this more efficiently
    this.color = layer.color.rgb;
    this.deferred = $.Deferred().resolve();
};
SnaprFX.filters.color.prototype.process = function(i, rgb){ return this.color; };

// overlay an image form url
SnaprFX.filters.image = function(layer, fx){
    // TODO: if opacity == 1 and mask == false we can use canvas.context.drawImage to do this more efficiently
    this.url = layer.image.image;
    this.width = fx.canvas.width;
    this.height = fx.canvas.height;
    this.canvas = new SnaprFX.Canvas(fx.asset_prefix+this.url, this.width, this.height);
    this.deferred = $.Deferred();
    var image_filter = this;
    this.canvas.deferred.done(function(){
        image_filter.pixels = image_filter.canvas.get_data();
        image_filter.deferred.resolve();
    });
};
SnaprFX.filters.image.prototype.process = function(i, rgb){
    return [this.pixels[i], this.pixels[i+1], this.pixels[i+2], this.pixels[i+3]];
};


// jQuery Plugin
// -------------

$.fn.snapr_fx = function(orig, pack, filter_slug) {
    var elements = this;
    $.ajax({
        url: 'filter-packs/'+pack+'/filters/' + filter_slug + '/filter.json',
        success: function(data){
            elements.each(function() {
                var element = $(this);
                var x = new SnaprFX.FX(orig.attr('src'), data.filter, 'filter-packs/'+ pack +'/filters/' + filter_slug + '/');
                x.deferred.done(function(){
                    element.attr('src', x.canvas.get_data_url());
                });
            });
        }
    });
};
