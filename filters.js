/*jslint bitwise: true */
/*global define: false, JpegMeta: false */

// ==ClosureCompiler==
// @compilation_level ADVANCED_OPTIMIZATIONS
// @output_file_name filters.min.js
// @code_url http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.js
// ==/ClosureCompiler==


// FX Overview
// -----------

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
// update img element

var debug_logging = true;

// used to address vaues in pixel arrays in a more human-readible way. pixel[R] == red value
var R=0,G=1,B=2,O=3;

/**
 * Main Class
 * @param {Object} options.
 * @constructor
 * @expose
 */
var SnaprFX = function(options){ return this.init(options); };


// Utilities
// ---------

SnaprFX.utils = {
    // Reads EXIF from a file identified by 'url'
    // Returns Deferred which resolves with selected EXIF properties
    read_exif: function(url){

        var deferred = $.Deferred();

        // use XHR to turn url (may be blob/file) into arraybuffer
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';

        /**
         * Reads data
         * @this {Object}
         */
        xhr.onload = function(e) {

            // read file as binary for exif extraction
            var exif_reader = new FileReader();

            /**
             * Extracts EXIF
             * @this {Object}
             */
            exif_reader.onloadend = function(){
                var exif = new JpegMeta.JpegFile(this.result, 'test.jpg');
                // exif reader no longer needed - GC can eat it
                exif_reader = null;
                xhr = null;
                deferred.resolve({
                    latitude: exif.gps && exif.gps.latitude && exif.gps.latitude.value,
                    longitude: exif.gps && exif.gps.longitude && exif.gps.longitude.value,
                    date: exif.exif && exif.exif.DateTimeOriginal && exif.exif.DateTimeOriginal.value,
                    orientation: exif.tiff && exif.tiff.Orientation && exif.tiff.Orientation.value
                });
            };
            var blob = new Blob([this.response]);
            exif_reader.readAsBinaryString(blob);
        };
        xhr.send();

        return deferred;
    },

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


// SnaprFX
// -------

/** @expose */
SnaprFX.prototype.deferred = null;


// options: {
//     url: original image url (may be blob/file),
//     width/height: absolute dimentions - stretch to fit
//     size/aspect: max width or height / crop image to force this aspect (w/h)
// }
SnaprFX.prototype.init = function(options){  var self = this;

    self.deferred = $.Deferred();

    self.options = options;

    // read EXIF first, it may have orientation
    // info needed for rendering the canvas
    SnaprFX.utils.read_exif(self.options.url).done(function(exif){

        self.exif = exif;

        self.load_original(true).done(function(){

            self.canvas = new SnaprFX.Canvas({
                width: self.original.width,
                height: self.original.height
            });

            self.canvas.context.drawImage(self.original.canvas, 0, 0);

            self.update_element();

            // timeout needed to ensure width/height
            // avaiable for sticker layer creation
            setTimeout(function(){
                self.create_overlay_elements();
                self.deferred.resolve();
            }, 1);
        });
    });

    self.load_filter_pack = $.Deferred();
    $.ajax({
        url: self.options.filter_pack + 'filter-pack.json',
        success: function(pack){
            self.filter_pack = pack.filter_pack;
            self.filter_pack.base_path = self.options.filter_pack;
            self.load_filter_pack.resolve(self.filter_pack);

            self.load_fonts();
        }
    });
    self.load_sticker_pack = $.Deferred();
    $.ajax({
        url: self.options.sticker_pack + 'sticker-pack.json',
        success: function(pack){
            self.sticker_pack = pack.sticker_pack;
            self.sticker_pack.by_slug = {};
            self.sticker_pack.base_path = self.options.sticker_pack;
            $.each(self.sticker_pack.sections, function(i, section){
                console.log(section);
                $.each(section.stickers, function(i, sticker){
                    self.sticker_pack.by_slug[sticker.slug] = sticker;
                });
            });
            self.load_sticker_pack.resolve(self.sticker_pack);
        }
    });

    self.filter_specs = {};
    self.stickers = [];
    self.text = [];
};

/**
 * Change the base image
 */
SnaprFX.prototype.set_url = function(url, callback){  var self = this;

    this.options.url = url;

    var deferred = $.Deferred();

    // read EXIF first, it may have orientation
    // info needed for rendering the canvas
    SnaprFX.utils.read_exif(self.options.url).done(function(exif){

        self.exif = exif;

        self.load_original(true).done(function(){

            self.apply_filter();
            deferred.resolve();

        });
    });

    return deferred;
};


/**
 * Loads any custom fonts onto page
 */
SnaprFX.prototype.load_fonts = function(){  var self = this;

    $.each(self.filter_pack.sections, function(i, section){
        $.each(section.filters, function(i, filter){

            var filter_path = self.filter_pack.base_path + 'filters/' + filter.slug + '/';
            // get filter details
            $.ajax({
                url: filter_path + 'filter.json',
                success: function(data){

                    // cache
                    self.filter_specs[filter.slug] = data.filter;

                    if(data.filter.fonts){
                        $.each(data.filter.fonts, function(i, font){

                            var css = "@font-face {";
                            css += "font-family: '"+font['font-family']+"';";
                            if(font['font-weight']){ css += "font-weight: "+font['font-weight']+";"; }
                            if(font['font-style']){ css += "font-style: "+font['font-style']+";"; }
                            if(font.eot){ css += "src: url('"+filter_path + 'fonts/'+font.eot+"');"; }
                            css += "src:";
                            if(font.eot){ css += "url('"+filter_path + 'fonts/'+font.eot+"?#iefix') format('embedded-opentype'),"; }
                            if(font.woff){ css += "url('"+filter_path + 'fonts/'+font.woff+"') format('woff'),"; }
                            if(font.ttf){ css += "url('"+filter_path + 'fonts/'+font.ttf+"') format('truetype'),"; }
                            if(font.svg){ css += "url('"+filter_path + 'fonts/'+font.svg+"#"+font['font-family']+"') format('svg');"; }
                            css += "}";

                            $('<style>'+css+'</style>').appendTo(document.head);

                            // use font on page so it's preloaded
                            $('<span style="font-family: '+font['font-family']+'"></span>').appendTo(document.body);

                        });
                    }
                }
            });
        });
    });
};

// loads the original image onto this.canvas
// includes any stickers unless 'stickers' === false
SnaprFX.prototype.load_original = function(stickers){  var self = this;

    var deferred = $.Deferred();

    // TODO: do we need to create a new canvas each time?
    self.original = new SnaprFX.Canvas({
        url: self.options.url,
        size: self.options.size,
        aspect: self.options.aspect,
        width: self.options.width,
        height: self.options.height,
        orientation: self.exif && self.exif.orientation
    });

    // stop here if we aren't rendering the Stickers
    // defaults to true

    self.original.deferred.done(function(){
        if(stickers === false){
            deferred.resolve();
        }else{
            self.render_stickers().done(function(){
                deferred.resolve();
            });
        }
    });


    return deferred;
};

// sets the html element's src to our canvas data
SnaprFX.prototype.update_element = function(){  var self = this;
    self.options.element.attr('src', self.canvas.get_data_url());
};

// remove all filters
/** @expose */
SnaprFX.prototype.revert = function(){  var self = this;
    self.current_filter = null;

    self.canvas.context.drawImage(self.original.canvas, 0, 0);
    self.update_element();

};

/**
 * apply filter specified by 'filter' or reapply last filter
 * apply stickers unless stickers: false
 * @param {Object} options.
 * @expose
 */
SnaprFX.prototype.apply_filter = function(options){  var self = this;

    $(document.body).addClass('fx-processing');

    // defaults
    options = $.extend({
        filter: self.current_filter,
        editable: false
    }, options);

    self.render_options = options;

    self.deferred = $.Deferred();

    // remove text frames from prev filter
    if(options.filter != self.current_filter){
        self.elements.overlay.find('.fx-text').remove();
    }

    if(debug_logging){ console.group(options.filter); }

    self.current_filter = options.filter;

    // the function that actually does the work
    function apply(){

        var filter_spec = self.filter_specs[self.current_filter];
        filter_spec.layer_index = -1;  // so first time we call 'next' layer it's 0

        if(self.render_options.region){
            if(debug_logging){ console.log('region', self.render_options.region); }
            var r = self.render_options.region;
            self.canvas.context.drawImage(
                self.original.canvas,
                r.left, r.top, r.width, r.height,
                r.left, r.top, r.width, r.height
            );
        }else{
            self.canvas.context.drawImage(self.original.canvas, 0, 0);
        }


        var filter = function(){
            self.pixels = self.canvas.get_data();
            self.apply_next_layer();


            // update element when done
            self.deferred.done(function(){
                self.update_element();
            });
        };

        if(!options.editable){
            self.render_stickers().done(filter);
        }else{
            filter();
        }

    }

    // run the above function, getting the spec first if not in cache
    if(options.filter in self.filter_specs){
        setTimeout(apply, 4);
    }else{
        $.ajax({
            url: self.filter_pack.base_path + 'filters/' + options.filter + '/filter.json',
            success: function(data){
                if(debug_logging){ console.log('loaded', options.filter); }
                self.filter_specs[options.filter] = data.filter;
                setTimeout(apply, 4);
            }
        });
    }

};

// "main" function - runs filter on px and puts them back
// on canvas with mask image and blend mode applied
SnaprFX.prototype.apply_next_layer = function(){  var self = this;
    // apply_next_layer allows processing to be deffered until something is ready (eg, loading mask image)
    // after this layer is finished apply_next_layer will be called again

    var filter_spec = self.filter_specs[self.current_filter];

    // move pointer to next layer
    filter_spec.layer_index++;

    // if there are no more layers we are done!
    if(filter_spec.layer_index >= filter_spec.layers.length){
        self.finish();
        return;
    }

    if(debug_logging){ console.time("applying " + filter_spec.layers[filter_spec.layer_index].type + " layer"); }

    if(debug_logging){ console.log("applying", filter_spec.layers[filter_spec.layer_index].type, "layer"); }

        // this layers spec
    var layer = filter_spec.layers[filter_spec.layer_index];
    // filter processes the px
    if(layer.filter){
        layer.filter.update && layer.filter.update(layer, self);
    }else{
        layer.filter = new SnaprFX.filters[layer.type](layer, self);
    }
    // blender mixes this layer with underlying
    layer.blender = layer.blender || new SnaprFX.Blender(layer.blending_mode || 'normal');

    // when the filter is ready (may need to load an image etc)
    layer.filter.deferred.done(function(){


        // some filters (eg blur) need the whole canvas - they can't work px by px
        // we store the result and blend it in px by px using blender/mask image
        var whole_canvas_result;
        if(layer.filter.whole_canvas){
            // put results of any underlying filters back on canvas
            // (not needed if this is the first layer - they are already there)
            if(filter_spec.layer_index !== 0){
                self.canvas.put_data(self.pixels);
            }

            // run the filter
            layer.filter.process(self.canvas);

            whole_canvas_result = self.canvas.get_data();
        }

        var mask_pixels;

        // function that gets result pixels and blends into existing ones
        function blend(){

            var region = self.render_options.region || {
                left: 0,
                top: 0,
                width: self.canvas.width,
                height: self.canvas.height
            };
            var i;

            //if(debug_logging){ console.log(region); }
            for ( var y = region.top; y < region.top+region.height; y += 1 ) {
                for ( var x = region.left; x < region.left+region.width; x += 1 ) {

                    i = (y * self.canvas.width + x) * 4;

                    var rgb;
                    if(layer.filter.whole_canvas){
                        // whole canvas has been processed by filter
                        // get relivent px
                        rgb = [whole_canvas_result[i], whole_canvas_result[i+1], whole_canvas_result[i+2], whole_canvas_result[i+3]];
                    }else{
                        // process this px now
                        rgb = layer.filter.process(i, [self.pixels[i], self.pixels[i+1], self.pixels[i+2]]);
                    }

                    // start with opacity for px returned by filter
                    var opacity = rgb[O];
                    if(opacity >= 0){  // >= 0 ensures a number (that's positive too)
                        opacity = opacity / 255;
                    }else{
                        opacity = 1;
                    }
                    // * opacity of this px from mask
                    if(layer.mask_image){
                        opacity = opacity * (mask_pixels[i]/255);
                    }
                    // * opacity of this whole layer
                    opacity = opacity * (layer.opacity/100);

                    // blend this layer with underlying
                    rgb = layer.blender.process(
                        [self.pixels[i], self.pixels[i+1], self.pixels[i+2]],
                        [rgb[R], rgb[G], rgb[B]],
                        opacity
                    );
                    self.pixels[i  ] = rgb[R];
                    self.pixels[i+1] = rgb[G];
                    self.pixels[i+2] = rgb[B];
                }
            }

            if(debug_logging){ console.timeEnd("applying " + filter_spec.layers[filter_spec.layer_index].type + " layer"); }
            self.apply_next_layer();
        }

        // if there's a mask we must adjust each of the new px opacity accordingly
        if(layer.mask_image){

            // load mask image
            var mask = new SnaprFX.Canvas({
                url: self.filter_pack.base_path + 'filters/' +filter_spec.slug+'/'+layer.mask_image, width:
                self.canvas.width, height:
                self.canvas.height
            });
            mask.deferred.done(function(){
                mask_pixels = mask.get_data();
                blend();
            });
        }else{
            blend();
        }
    });
};

// once all layers are processed this puts the data back on the
// canvas, updates the element and resolves self.deffered
SnaprFX.prototype.finish = function(){  var self = this;
    // put px back in canvas

    if(debug_logging){ console.time('writing data back'); }

    self.canvas.put_data(self.pixels);
    self.update_element();
    self.deferred.resolve();

    $(document.body).removeClass('fx-processing');

    if(debug_logging){ console.timeEnd('writing data back'); }

    if(debug_logging){ console.groupEnd(self.current_filter); }
};

// removes stickers/text from render and displays their html overaly elements
SnaprFX.prototype.unrender_editables = function(){  var self = this;

    $.each(self.stickers, function(i, sticker){
        sticker.unrender();
    });

    $.each(self.text, function(i, text){
        text.unrender();
    });

    // revert to orig with no stickers
    //setTimeout(function(){  // timeout allows other thigs to update before this starts
        self.apply_filter({editable: true});
    //}, 4);
};

// replaces stickers/text in render and hides their html overaly elements
SnaprFX.prototype.rerender_editables = function(){  var self = this;

    // revert to orig with no stickers
    self.apply_filter({editable: false});

    self.deferred.done(function(){
        $.each(self.text, function(i, text){
            text.rerender();
        });

        $.each(self.stickers, function(i, sticker){
            sticker.rerender();
        });
    });
};

// initialise sticker and text overlay layers
SnaprFX.prototype.create_overlay_elements = function(){  var self = this;
    // store actual image, sticker div and a wrapper for both
    self.elements = {image: self.options.element};
    var full_size = {
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        width: '100%'
    };
    self.elements.overlay = $('<div class="fx-overlay-layer">')
        .css(full_size)
        .click(function(event){
            if(
                self.render_options.editable &&  // if thifs are already unrendered
                !$(event.target).closest('.fx-text-wrapper').length &&  // and click wasn't on a text el
                !$(event.target).closest('.fx-sticker').length  // and click wasn't on a sticker
            ){
                self.rerender_editables();
            }
        });
    self.elements.wrapper = $('<div class="fx-wrapper">').css({
        position: 'relative',
        height: self.elements.image.height(),
        width: self.elements.image.width()
    });

    // put wrapper on page
    self.elements.wrapper.insertAfter(self.elements.image);

    // put elements in wrapper
    self.elements.image.appendTo(self.elements.wrapper);
    self.elements.overlay.appendTo(self.elements.wrapper);
};


// Stickers
// --------

// create a new sticker
/** @expose */
SnaprFX.prototype.add_sticker = function(slug){  var self = this;

    var sticker = new SnaprFX.sticker(slug, self);
    self.stickers.push(sticker);
    sticker.deferred.done(function(){
        self.elements.overlay.append(sticker.element.addClass('fx-sticker-active'));
    });


};

SnaprFX.prototype.render_stickers = function(){  var self = this;

    var deferred = $.Deferred();

    // function to check if all other stickers
    // are placed after each on is done
    function check_stickers_resolved(){
        var done = true;
        $.each(self.stickers, function(i, sticker){
            if(sticker.deferred.state() == 'pending'){
                done = false;
                return false; // break each
            }
        });
        if(done){
            deferred.resolve();
        }
    }

    // when canvas is ready, place stickers
    self.original.deferred.done(function(){

        // resolve if there are no stickers
        if(!self.stickers.length){
            deferred.resolve();
        }

        // place each sticker
        $.each(self.stickers, function(i){
            self.stickers[i].render(self.canvas).done(check_stickers_resolved);
        });
    });

    return deferred;
};

// Sticker class
/**
 * Sticker class
 * @param {string} slug. The sticker slug.
 * @param {Object} parent. An instance of SnaprFX.
 * @constructor
 */
SnaprFX.sticker = function(slug, parent){  var self = this;
    self.slug = slug;
    self.parent = parent;

    self.spec = parent.sticker_pack.by_slug[slug];

    self.deferred = $.Deferred();

    self.load().done(function(){

        self.scale_factor = Math.min(parent.canvas.width / parent.sticker_pack.target_canvas.width, parent.canvas.height / parent.sticker_pack.target_canvas.height);

        // Build element
        // -------------

        var html = '<div class="fx-sticker fx-sticker-rendered">';
            html += '<a class="fx-remove-sticker fx-sticker-handle" data-role="button" data-icon="delete" data-iconpos="notext" data-theme="e">✗</a>';
            html += '<a class="fx-render-sticker fx-sticker-handle" data-role="button" data-icon="tick" data-iconpos="notext" data-theme="e">✔</a>';
            html += '<a class="fx-scale-sticker fx-sticker-handle" data-role="button" data-icon="rotate" data-iconpos="notext" data-theme="e">R</a>';

            html += '<img class="fx-sticker-image" src="'+self.parent.sticker_pack.base_path+'assets/'+slug+'.png">';
        html += '</div>';

        var css = {
            position: 'absolute',
            width: self.image.width * self.scale_factor,
            height: self.image.height * self.scale_factor
        };

        if(self.spec.position && self.spec.position.center){
            css.left = self.spec.position.center.x * self.scale_factor - css.width/2;
            css.top = self.spec.position.center.y * self.scale_factor - css.height/2;
        }else{
            css.left = parent.canvas.width/2 - css.width/2;
            css.top = parent.canvas.height/2 - css.height/2;
        }
        self.element = $(html).css(css);

        if(!self.rendered){
            self.element.removeClass('fx-sticker-rendered');
        }

        // events
        // ------

        // render button
        self.element.find('.fx-render-sticker').on('click', function(event){
            parent.rerender_editables();
            // stop click porpegating up to sticker element and triggering unrender right after rerender
            event.stopPropagation();
        });

        // delete button
        self.element.find('.fx-remove-sticker').on('click', function(){ self.remove(); });

        // click to unrender
        self.element.on('click', function(){
            if(self.rendered){
                self.element
                    .addClass('fx-sticker-active')
                    .removeClass('fx-sticker-rendered');

                parent.unrender_editables();
            }
        });

        // dragging
        // --------

        // move
        self.mousemove = function(event){
            if(!self.rendered){
                self.element.css({
                    left: event.pageX - self.drag_from.left,
                    top: event.pageY - self.drag_from.top
                });
            }
        };

        // finish drag
        self.mouseup = function(){
            parent.elements.wrapper.off('mousemove', self.mousemove);
        };
        parent.elements.wrapper.on('mouseup', self.mouseup);

        // start drag
        self.element.on('mousedown', function(event) {
            if(!self.rendered){
                self.drag_from = {
                    left: event.pageX - self.element.position().left,
                    top: event.pageY - self.element.position().top
                };
                parent.elements.wrapper.on('mousemove', self.mousemove);
            }

            parent.elements.overlay
                .addClass('fx-editing-sticker')
                .removeClass('fx-editing-text');
        });

        // prevent default drag (like drag image to desktop)
        self.element.on('dragstart', function(event) { event.preventDefault(); });  // stop normal dragging of image

        self.deferred.resolve();

    });
};

// load sticker image
SnaprFX.sticker.prototype.load = function(){  var self = this;

    if(self.load_deferred){
        return self.load_deferred;
    }

    self.load_deferred = $.Deferred();

    // get image
    self.image = new Image();
    self.image.src = self.parent.sticker_pack.base_path+'assets/'+self.slug+'.png';

    self.image.onload = function() {
        self.load_deferred.resolve();
    };

    return self.load_deferred;

};

// render sticker into actual image
SnaprFX.sticker.prototype.render = function(canvas){  var self = this;

    self.deferred = $.Deferred();

    var sticker = self.element.find('.fx-sticker-image'),
        offset = sticker.offset(),
        layer = self.element.parent(),
        layer_offset = layer.offset(),

        x = (offset.left - layer_offset.left) / layer.width(),
        y = (offset.top - layer_offset.top) / layer.height(),
        width = sticker.width() / layer.width(),
        height = sticker.height() / layer.height();

    self.load().done(function() {
        // place sticker
        canvas.context.drawImage(self.image, 0,0, self.image.width, self.image.height ,x * canvas.width ,y * canvas.height ,width * canvas.width ,height * canvas.height);
        // notify that it's ready
        self.deferred.resolve();
    });

    return self.deferred;
};

// remove sticker from image, show html overlay
SnaprFX.sticker.prototype.unrender = function(){  var self = this;

    // track if it's rendered in image or html overlay
    self.rendered = false;

    self.element.removeClass('fx-sticker-rendered');
};


SnaprFX.sticker.prototype.rerender = function(){  var self = this;

    // track if it's rendered in image or html overlay
    self.rendered = true;

    self.element.addClass('fx-sticker-rendered');
};

SnaprFX.sticker.prototype.remove = function(){  var self = this;

    // remove html overlay
    self.element.remove();

    // remove events
    self.parent.elements.wrapper.off('mousemove', self.mousemove).off('mouseup', self.mouseup);

    // remove from SnaprFX's list
    $.each(self.parent.stickers, function(i, sticker){
        if(sticker == self){
            self.parent.stickers.splice(i, 1);
        }
    });
};


// Canvas
// ------

/**
 * gets an image file and reads its pixels
 * based on http://matthewruddy.github.com/jQuery-filter.me/
 * @param {Object} options.
 * @constructor
 */
SnaprFX.Canvas = function(options){  var self = this;

    self.deferred = $.Deferred();  // to notify when read to read

    // create canvas
    self.canvas = document.createElement('canvas');
    self.context = self.canvas.getContext('2d');

    // no image url, stop here
    if(!options.url){
        self.width = self.canvas.width = options.width;
        self.height = self.canvas.height = options.height;
        self.deferred.resolve();
        return;
    }

    if(debug_logging){ console.time('get image'); }

    // correct orientation
    var rotation;
    switch (options.orientation){
        case 3:
            rotation = Math.PI;
            break;
        case 6:
            rotation = Math.PI * 0.5;
            break;
        case 8:
            rotation = Math.PI * 1.5;
            break;
        default:
            rotation = 0;
    }

    // get image
    self.image = new Image();
    self.image.src = options.url;

    self.image.onload = function() {

        this.aspect = this.width/this.height;
        var x1 = 0,
            y1 = 0,
            x2 = this.width,
            y2 = this.height;
        if(options.size){
            if(options.aspect){
                var chop;
                if(this.aspect > options.aspect){
                    self.height = self.canvas.height = options.size;
                    self.width = self.canvas.width = self.height * options.aspect;
                    chop = this.width - (this.height * options.aspect);

                    x1 = chop/2;
                    x2 = this.width-chop;
                }else{
                    self.width = self.canvas.width = options.size;
                    self.height = self.canvas.height = self.width / options.aspect;
                    chop = (this.height - (this.width / options.aspect));

                    y1 = chop/2;
                    y2 = this.height-chop;
                }
            }else{
                if(this.aspect > 1){
                    self.width = self.canvas.width = options.size;
                    self.height = self.canvas.height = self.width / this.aspect;
                }else{
                    self.height = self.canvas.height = options.size;
                    self.width = self.canvas.width = self.height * this.aspect;
                }
            }
        }else{
            // scale canvas to image size
            self.width = self.canvas.width = options.width || this.width;
            self.height = self.canvas.height = options.height || this.height;
        }

        // Draw the image onto the canvas
        self.context.translate(self.canvas.width/2, self.canvas.height/2);
        self.context.rotate(rotation);
        self.context.drawImage(this, x1, y1, x2, y2, self.canvas.width/-2, self.canvas.height/-2, self.canvas.width, self.canvas.height);
        self.context.rotate(-rotation);
        self.context.translate(self.canvas.width/-2, self.canvas.height/-2);

        delete self.image;

        // notify that it's ready
        self.deferred.resolve();

        if(debug_logging){ console.timeEnd('get image'); }
    };
};

SnaprFX.Canvas.prototype.get_data = function(){
    var image_data = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    // if you ever overwrite this it seems you can't write the px back to the canvas
    this.data = image_data;
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

SnaprFX.Canvas.prototype.clear = function() {
    // setting width clears and resets canvas
    this.canvas.width = this.canvas.width;
};


// Blender
// -------

/**
 * Blends two layers together
 * @param {String} mode.
 * @constructor
 */
SnaprFX.Blender = function(mode){
    if(debug_logging){ console.log(' - Blend:', mode); }

    this.mode = this.blend_modes[mode];

    // does this blend mode require all RGB values
    if(this.mode.rgb){
        this.process = function(orig, overlay, opacity){

            // the the blended result
            overlay = this.mode.process(orig, overlay);

            // apply it to the underlying layer with opacity
            var mix = [];
            for (var channel = R; channel <= B; channel++) {
                mix[channel] = overlay[channel] * opacity + orig[channel] * (1 - opacity);
            }
            return mix;
        };
    // or can it work with the channels individually
    }else{
        this.process = function(orig, overlay, opacity){
            var mix = [];
            for (var channel = R; channel <= B; channel++) {
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
SnaprFX.filters.image = function(layer, fx){
    // TODO: if opacity == 1 and mask == false we can use canvas.context.drawImage to do this more efficiently
    this.url = layer.image.image;
    this.width = fx.canvas.width;
    this.height = fx.canvas.height;
    this.canvas = new SnaprFX.Canvas({url: fx.filter_pack.base_path + 'filters/' + fx.current_filter+'/'+this.url, width: this.width, height: this.height});
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

// Text
// ----

/**
 * Text layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.text = function(layer, fx){  var self = this;

    fx.text.push(self);
    self.slug = layer.slug;
    self.text_style = layer.text.style;
    self.text = fx.options.text && fx.options.text[layer.slug] || layer.text.default_value;

    self.canvas = new SnaprFX.Canvas({width: fx.canvas.width, height: fx.canvas.height});

    self.x_scale_factor = self.canvas.width / fx.filter_specs[fx.current_filter].target_canvas.width;
    self.y_scale_factor = self.canvas.height / fx.filter_specs[fx.current_filter].target_canvas.height;

    self.position = {
        top: layer.position.bbox.top * self.y_scale_factor,
        bottom: layer.position.bbox.bottom * self.y_scale_factor,
        left: layer.position.bbox.left * self.x_scale_factor,
        right: layer.position.bbox.right * self.x_scale_factor
    };


    // debug
    // -----
    // draws bounding box
    self.canvas.context.strokeRect(
        self.position.left,
        self.position.top,
        self.position.right - self.position.left,
        self.position.bottom - self.position.top
    );


    self.update(layer, fx);

};

SnaprFX.filters.text.prototype.update = function(layer, fx){  var self = this;

    self.rendered = !fx.render_options.editable;
    self.spec = layer;
    self.deferred = $.Deferred();

    self.create_overlay(layer, fx);

    self.canvas.clear();

    // set font properties on canvas
    self.canvas.context.font = self.text_element.css('font');
    self.canvas.context.textAlign = self.text_style.textAlign || 'left';
    self.canvas.context.textBaseline = self.text_style.textBaseline || 'top';
    self.canvas.context.fillStyle = self.text_style.fillStyle;

    self.text_style.fontSize = parseInt(self.text_element.css('font-size'), 10);
    self.text_style.lineHeight = parseInt(self.text_element.css('line-height'), 10);

    // wrapping
    // --------

    var max_width = self.position.right - self.position.left,
        max_height = self.position.bottom - self.position.top;

    function word_wrap(text, max_width){
        var orig_lines = text.split('\n'),
            lines = [],
            line_index = 0;

        for(var l=0; l < orig_lines.length; l++){
            var words = orig_lines[l].split(' ');
            lines[line_index] = words[0];

            for(var w=1; w < words.length; w++){
                var next_line_length = self.canvas.context.measureText(lines[line_index] + ' ' + words[w]).width;
                // if adding the next word would be too long then put the text in as it is
                if(next_line_length > max_width){
                    line_index++;
                    lines[line_index] = words[w];
                }else{
                    lines[line_index] = lines[line_index]  + ' ' + words[w];
                }
            }
            line_index++;
        }

        return lines;
    }

    var lines = word_wrap(self.text, max_width);
    while(!lines || (lines.length - 1) * self.text_style.lineHeight + self.text_style.fontSize > max_height){


        self.text_style.fontSize = self.text_style.fontSize * 0.8;
        self.text_element.css('font-size', self.text_style.fontSize);

        self.text_style.lineHeight = self.text_style.lineHeight * 0.8;
        self.text_element.css('line-height', self.text_style.lineHeight+ 'px');

        self.canvas.context.font = self.text_element.css('font');

        lines = word_wrap(self.text, max_width);

    }


    // positioning
    // -----------

    var x,
        y;

    // set x position for text based on alignment
    switch(self.text_style.textAlign){
        case 'end':
        case 'right':
            x = self.position.right;
            break;
        case 'center':
            x = max_width / 2 + self.position.left;
            break;
        default:  // left, start
            x = self.position.left;

    }

    // set y position for text based on alignment
    var padding_offset;
    switch(self.text_style.textBaseline){
        case 'hanging':
        case 'alphabetic':
        case 'ideographic':
        case 'bottom':
            // start No. of extra lines up from bottom
            y = self.position.bottom - (self.text_style.lineHeight * (lines.length - 1));
            padding_offset = - self.text_style.lineHeight;
            break;
        case 'middle':
            y = (max_height / 2 + self.position.top) - ((self.text_style.lineHeight * (lines.length - 1)) / 2);
            padding_offset = - self.text_style.lineHeight/2;
            break;
        default:  // top
            // start at top
            y = self.position.top;
            padding_offset = 0;

    }

    // update overlay with new y value
    self.element.css({
        'padding-top': y-self.position.top + padding_offset + 'px',
        'height': self.position.bottom - y - padding_offset + "px"
    });

    // draw text
    // ---------

    if(self.slug !== fx.render_options.active_text && !layer.removed){

        for(var l=0; l < lines.length; l++){
            self.canvas.context.fillText(lines[l], x, y+l*self.text_style.lineHeight, max_width);

            // draws bounding box
            // self.canvas.context.strokeRect(
            //     self.position.left,
            //     y+l*self.text_style.lineHeight,
            //     max_width,
            //     self.text_style.lineHeight
            // );

        }

    }

    self.pixels = self.canvas.get_data();
    self.deferred.resolve();
};
SnaprFX.filters.text.prototype.create_overlay = function(layer, fx){  var self = this;

    // stop if element already exists and is in dom
    if(self.element && jQuery.contains(document.documentElement, self.element[0])){
        return;
    }

    self.overlay = fx.elements.overlay;

    self.element  = $('<div class="fx-text fx-text-rendered">')
    .css({
        position: 'absolute',
        left: self.position.left + "px",
        top: self.position.top + "px",
        width: self.position.right - self.position.left + "px",
        height: self.position.bottom - self.position.top + "px",
        'text-align': self.text_style.textAlign
    });

    self.wrapper = $('<div class="fx-text-wrapper">');

    self.text_element  = $('<div class="fx-text-inner" data-layer="'+self.slug+'">')
    .css({
        font: self.text_style.font,
        color: self.text_style.fillStyle
    })
    .text(self.text)
    .on('click', function(){
        var wrapper = $(this).parent().parent();

        var active = wrapper.hasClass('fx-text-active'),
            rendered = wrapper.hasClass('fx-text-rendered');

        // deactivate all other text layers
        var deactivate = self.overlay.find('.fx-text-active')    // find active text
            .not(wrapper)                       // not this one though
            .removeClass('fx-text-active')      // make inactive...
            .trigger('deactivate', layer)
            .find('.fx-text-inner')
                .attr('contenteditable', false);

        if(deactivate.length){
            fx.active_text = null;
        }


        // activate if not already active
        if(!active){
            wrapper
                .addClass('fx-text-active')
                .removeClass('fx-text-rendered')
                .trigger('activate', layer)
                .find('.fx-text-inner')
                    .attr('contenteditable', true);

            fx.active_text = self;
        }

        fx.elements.overlay
            .addClass('fx-editing-text')
            .removeClass('fx-editing-sticker');

        // remove text from rendered image
        if(rendered){
            fx.unrender_editables();
        }
    })
    .on('keyup', function(){
        self.check_size();
    });

    if(!self.rendered){
        self.element.removeClass('fx-text-rendered');
    }

    self.element.append(self.wrapper);

    self.wrapper.append(self.text_element);

    self.wrapper.append(
        $('<a class="fx-delete-layer fx-text-button">✗</a>')
            .css({
                position: 'absolute',
                top: 0,
                left: 0
            })
            // trigger removal
            .click(function(){ self.remove(); })
    );
    self.wrapper.append(
        $('<a class="fx-render-layer fx-text-button">✔</a>')
            .css({
                position: 'absolute',
                bottom: 0,
                right: 0
            })
            // trigger render
            .click(function(){ fx.rerender_editables(); })
    );


    // font setup
    // ----------

    // apply scale factor to font size
    self.text_style.fontSize = parseInt(self.text_element.css('font-size'), 10) * self.y_scale_factor;
    self.text_element.css('font-size', self.text_style.fontSize);

    // apply scale factor to line height
    // if line hight is % then convert it to px now
    self.text_style.lineHeight = self.text_element.css('line-height');
    if(self.text_style.lineHeight.substr(-1) == '%'){
        self.text_style.lineHeight = (parseInt(self.text_style.lineHeight, 10) / 100) * self.text_style.fontSize;
    }else{
        self.text_style.lineHeight = parseInt(self.text_style.lineHeight, 10) * self.y_scale_factor;
    }
    self.text_element
        .css('line-height', self.text_style.lineHeight + 'px')
        .data('line-height-multiplier', self.text_style.lineHeight / self.text_style.fontSize);



    self.overlay.append(self.element);
};

SnaprFX.filters.text.prototype.change_style = function(css){  var self = this;
    self.text_element.css(css);
    if('text-align' in css){
        self.element.css('text-align', css['text-align']);
    }

    self.check_size();

};
SnaprFX.filters.text.prototype.check_size = function(css){  var self = this;

    self.text_style.fontSize = parseInt(self.text_element.css('font-size'), 10);
    self.text_style.lineHeight = parseInt(self.text_element.css('line-height'), 10);

    while(self.text_element.width() > self.element.width() || self.text_element.height() > self.element.height()){

        self.text_style.fontSize = self.text_style.fontSize * 0.99;
        self.text_element.css('font-size', self.text_style.fontSize);

        self.text_style.lineHeight = self.text_style.lineHeight * 0.99;
        self.text_element.css('line-height', self.text_style.lineHeight+ 'px');

    }

    // set y position for text based on alignment
    var padding;
    switch(self.text_style.textBaseline){
        case 'hanging':
        case 'alphabetic':
        case 'ideographic':
        case 'bottom':
            // start No. of extra lines up from bottom
            padding = self.position.bottom - self.text_element.height();
            break;
        case 'middle':
            padding = (self.element.outerHeight() / 2) - (self.text_element.height() / 2);
            break;
        default:  // top
            // start at top
            padding = 0;

    }

    // update overlay with new y value
    self.element.css({
        'padding-top': padding + 'px',
        'height': self.position.bottom - self.position.top - padding + "px"
    });

};

SnaprFX.filters.text.prototype.remove = function(){  var self = this;
    self.element.hide();
    self.spec.removed = true;
};
SnaprFX.filters.text.prototype.unrender = function(){  var self = this;
    self.element.removeClass('fx-text-rendered');
};
SnaprFX.filters.text.prototype.rerender = function(){  var self = this;

    // strip HTML, replace <br> with newlines
    self.text = self.text_element.html()
        .replace(/<br\/?>/g, '\n')  // <br> to newline
        .replace(/&nbsp;/g, ' ')  // non-breking space to normal space
        .replace(/<.*?>/g, '');  // strip html tags

    // but back stripped text with <br>s for newlines
    self.text_element.html(self.text.replace(/\n/g, '<br>'));

    self.text_style.fillStyle = self.text_element.css('color');
    self.text_style.textAlign = self.element.css('text-align');

    self.element.addClass('fx-text-rendered');
};

SnaprFX.filters.text.prototype.process = function(i, rgb){  var self = this;
    if(!self.rendered){ return [0,0,0,0]; }
    return [self.pixels[i], self.pixels[i+1], self.pixels[i+2], self.pixels[i+3]];
};



// require.js module
// -----------------

if ( typeof define === "function" && define.amd ) {
    define(function(){return SnaprFX;});
}
