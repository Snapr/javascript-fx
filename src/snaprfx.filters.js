/*global SnaprFX: false, debug_logging: false, R: false, G: false, B: false */

SnaprFX.filters = {};

/**
 * Adjustment layer - identifies adjustment type and deferrs processing to that type
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.adjustment = function(layer){
    // adjustment layer is just a wrapper for real adjustment type
    if(debug_logging){ console.log(" - Adjustment:", layer.adjustment.type); }

    this.filter = new SnaprFX.filters[layer.adjustment.type](layer);
    this.whole_canvas = this.filter.whole_canvas;
    this.process = this.filter.process;
    this.deferred = $.Deferred().resolve();
};

/**
 * Curves adjustment layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.curves = function(layer){
    this.curves = layer.adjustment;
    this.splines = {};

    var filter = this;

    ['rgb', 'red', 'green', 'blue'].forEach(function(channel){

        // if not specified return a dummy function
        if(filter.curves[channel].length === 0){
            filter.splines[channel] = {interpolate: function(x){return x;}};
            return;
        }

        // convert from snapr currves spec format [[in1,out1],[in2,out2]]
        // to CubicSpline's input format [in1,in2], [out1,out2]
        var inputs = [], outputs = [];
        filter.curves[channel].forEach( function(point){
            inputs.push(point[0]);
            outputs.push(point[1]);
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
        this.max_in = x[0];
        this.min_in = x[0];
        for (i = 0; (0 <= n ? i < n : i > n); (0 <= n ? i += 1 : i -= 1)) {
          h[i] = x[i + 1] - x[i];
          k[i] = a[i + 1] - a[i];
          s[i] = k[i] / h[i];
          this.max_out = a[i+1] > this.max_out ? a[i+1] : this.max_out ;
          this.min_out = a[i+1] < this.min_out ? a[i+1] : this.min_out ;
          this.max_in = x[i+1] > this.max_in ? x[i+1] : this.max_in ;
          this.min_in = x[i+1] < this.min_in ? x[i+1] : this.min_in ;
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
        if(x >= this.max_in){ return this.max_out; }
        if(x <= this.min_in){ return this.min_out; }

        var deltaX, i, y, _ref;
        for (i = _ref = this.x.length - 1; (_ref <= 0 ? i <= 0 : i >= 0); (_ref <= 0 ? i += 1 : i -= 1)) {
          if (this.x[i] <= x) {
            break;
          }
        }
        deltaX = x - this.x[i];
        return this.a[i] + this.b[i] * deltaX + this.c[i] * Math.pow(deltaX, 2) + this.d[i] * Math.pow(deltaX, 3);
    };

    return CubicSpline;
}();

/**
 * Levels adjustment layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
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

    rgb[R] = this.filter.interpolate(rgb[R]);
    rgb[G] = this.filter.interpolate(rgb[G]);
    rgb[B] = this.filter.interpolate(rgb[B]);

    return rgb;
};

/**
 * Hue adjustment layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.hue = function(layer){
    this.hue = layer.adjustment.amount;
};
SnaprFX.filters.hue.prototype.process = function(i, rgb){

    var hsl = SnaprFX.utils.rgbToHsl(rgb[R], rgb[G], rgb[B]);
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

/**
 * Saturation adjustment layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.saturation = function(layer){
    this.saturation = layer.adjustment.amount / 100;
};
SnaprFX.filters.saturation.prototype.process = function(i, rgb){
    // adapted from https://github.com/jseidelin/pixastic/blob/master/actions/hsl.js
    // claims to match photoshop but photoshop seems to ramp up exponentinally with
    // increasing saturation and this does not. Photoshop +100 sat != 100% saturation

    var hsl = SnaprFX.utils.rgbToHsl(rgb[R], rgb[G], rgb[B]);
    var sat;  // sat valur for this px

    if (this.filter.saturation < 0) {
        sat = hsl[1] * (this.filter.saturation + 1);
    } else {
        sat = hsl[1] * (this.filter.saturation * 2 + 1);
    }

    // clip
    sat = Math.min(255, sat);

    return SnaprFX.utils.hslToRgb(hsl[0], sat, hsl[2]);
};

/**
 * Lightness adjustment layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.lightness = function(layer){
    this.lightness = layer.adjustment.amount / 100;
};
SnaprFX.filters.lightness.prototype.process = function(i, rgb){

    var lightness = this.filter.lightness,
        multiplier = lightness < 0 ? 1 + lightness : 1 - lightness,
        increase = lightness < 0 ? 0 : lightness * 255;

    return [
        Math.min(rgb[R] * multiplier + increase, 255),
        Math.min(rgb[G] * multiplier + increase, 255),
        Math.min(rgb[B] * multiplier + increase, 255)
    ];
};

/**
 * Curves adjustment layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.remap_channels = function(layer){  var self = this;
    self.channels = layer.adjustment;
    self.blender = new SnaprFX.Blender('lighten');
};
SnaprFX.filters.remap_channels.prototype.process = function(i, rgb){  var self = this.filter;

    var pixel = self.channels.base || rgb;
    pixel = self.blender.process(
        pixel,
        self.channels.b,
        rgb[B]/255
    );
    pixel = self.blender.process(
        pixel,
        self.channels.g,
        rgb[G]/255
    );
    pixel = self.blender.process(
        pixel,
        self.channels.r,
        rgb[R]/255
    );
    return pixel;
};

/**
 * Blur filter
 * Blurs image by scaling it down and back up a few times
 * based on http://www.pixastic.com/lib/git/pixastic/actions/blurfast.js
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.blur = function(layer){
    // this filter needs the whole canvas, it can't work px by px
    this.whole_canvas = true;
    // amount must be 0-5
    this.amount = Math.max(0, Math.min(5, layer.adjustment.amount));
};
SnaprFX.filters.blur.prototype.process = function(canvas){

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

/**
 * Flat color layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.color = function(layer){
    // TODO: if mask == false we can use canvas.context.fillRect to do this more efficiently
    this.color = layer.color.rgb;
    this.deferred = $.Deferred().resolve();
};
SnaprFX.filters.color.prototype.process = function(i, rgb){ return this.color; };

/**
 * Flat color layer
 * overlay an image form url
 * @constructor
 * @param {Object} layer. Layer options.
 * @param {Object} fx. An instance of SnaprFX.
 */
SnaprFX.filters.image = function(layer, fx){  var self = this;
    // TODO: if opacity == 1 and mask == false we can use canvas.context.drawImage to do this more efficiently
    self.url = layer.image.image;
    self.width = fx.canvas.width;
    self.height = fx.canvas.height;
    self.canvas = new SnaprFX.Canvas({url: fx.filter_pack.base_path + 'filters/' + fx.current_filter+'/'+self.url, width: self.width, height: self.height});
    self.deferred = $.Deferred();
    self.canvas.deferred.done(function(){
        self.pixels = self.canvas.get_data();
        self.deferred.resolve();
    });
};
SnaprFX.filters.image.prototype.update = function(layer, fx){  var self = this;
    self.width = fx.canvas.width;
    self.height = fx.canvas.height;
    self.deferred = $.Deferred();
    self.canvas.set_size(self.width, self.height).done(function(){
        self.pixels = self.canvas.get_data();
        self.deferred.resolve();
    });
};

SnaprFX.filters.image.prototype.process = function(i, rgb){
    return [this.pixels.data[i], this.pixels.data[i+1], this.pixels.data[i+2], this.pixels.data[i+3]];
};



