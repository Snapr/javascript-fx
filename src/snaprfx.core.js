/*global define: false, JpegMeta: false */

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

var debug_logging = false,
    debug_canvas = false;

// used to address vaues in pixel arrays in a more human-readible way. pixel[R] == red value
var R=0,G=1,B=2,O=3;

/**
 * Main Class
 * @param {Object} options.
 * @constructor
 * @expose
 */
var SnaprFX = function(options){ return this.init(options); };
window['SnaprFX'] = SnaprFX;

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
    self.render_options = {
        editable: false
    };

    // read EXIF first, it may have orientation
    // info needed for rendering the canvas
    SnaprFX.utils.read_exif(self.options.url).done(function(exif){

        self.exif = exif;

        self.load_original(true).done(function(){

            self.options.width = self.original.width;
            self.options.height = self.original.height;
            self.render_options.width = self.render_options.width || self.original.width;
            self.render_options.height = self.render_options.height || self.original.height;

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

    /** @expose */
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

    /** @expose */
    self.load_sticker_pack = $.Deferred();
    $.ajax({
        url: self.options.sticker_pack + 'sticker-pack.json',
        success: function(pack){
            self.sticker_pack = pack.sticker_pack;
            self.sticker_pack.by_slug = {};
            self.sticker_pack.base_path = self.options.sticker_pack;
            $.each(self.sticker_pack.sections, function(i, section){
                $.each(section.stickers, function(i, sticker){
                    self.sticker_pack.by_slug[sticker.slug] = sticker;
                });
            });
            self.load_sticker_pack.resolve(self.sticker_pack);
        }
    });

    self.current_filter = '_original';
    self.filter_specs = { _original: { name: "*Original*", slug: "_original", layers: [] } };
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

            self.apply_filter({editable: self.render_options.editable});
            deferred.resolve();

        });
    });

    return deferred;
};

SnaprFX.prototype.set_options = function(options){  var self = this;
    var render_text = self.options.render_text;

    $.extend(self.options, options);

    // if render_text just got turned on then render it
    if(!render_text && self.options.render_text){
        self.apply_filter({render_text: true, editable:false});
    }

    self.elements.overlay.toggleClass('fx-text-disabled', self.options.disable_text_edit === true);
    self.elements.overlay.toggleClass('fx-stickers-disabled', self.options.disable_sticker_edit === true);
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

/**
 * apply filter specified by 'filter' or reapply last filter
 * apply stickers unless stickers: false
 * @param {Object} options.
 * @expose
 */
SnaprFX.prototype.apply_filter = function(options){  var self = this;

    self.deferred = $.Deferred();

    $(document.body).addClass('fx-processing');

    setTimeout(function(){

        // defaults
        options = $.extend({
            filter: self.current_filter,
            editable: false,
            width: self.options.width,
            height: self.options.height
        }, options);

        self.render_options = options;

        if(!options.editable && !options.output){
            self.deferred.done(function(){
                if(self.options.render_text !== false || self.render_options.render_text){
                    $.each(self.text, function(i, text){
                        text.rerender();
                    });
                }

                $.each(self.stickers, function(i, sticker){
                    sticker.rerender();
                });
            });
        }

        // remove text frames from prev filter
        if(options.filter != self.current_filter){
            self.elements.overlay.find('.fx-text').addClass('fx-text-old');
            self.without_extras = null;
        }

        if(debug_logging){ console.group(options.filter); }

        self.current_filter = options.filter;

        // the function that actually does the work
        function apply(){

            var filter_spec = self.filter_specs[self.current_filter];

            if(filter_spec){
                filter_spec.layer_index = -1;  // so first time we call 'next' layer it's 0
            }

            if(self.render_options.region){
                if(debug_logging){ console.log('region', self.render_options.region); }
                var r = self.render_options.region;
                self.canvas.context.drawImage(
                    self.original.canvas,
                    r.left, r.top, r.width, r.height,
                    r.left, r.top, r.width, r.height
                );
            }else{
                var done = false;
                function draw_original(){
                    if(done){
                        self.canvas.context.drawImage(self.original.canvas, 0, 0);
                    }
                    done = true;
                }
                self.canvas.set_size(self.render_options.width, self.render_options.height).done(draw_original);
                self.original.set_size(self.render_options.width, self.render_options.height).done(draw_original);
            }


            var filter = function(){
                self.pixels = self.canvas.get_data();
                self.apply_next_layer();
            };

            if(!options.editable || self.options.disable_sticker_edit){
                self.render_stickers().done(filter);
            }else{
                filter();
            }

        }

        if(!options.filter){
           setTimeout(apply, 4);
        }else{
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
        }
    }, 4);

};

SnaprFX.prototype.output = function(options){  var self = this;

    var deferred = $.Deferred();

    self.apply_filter({
        output: true,
        width: options.width,
        height: options.height
    });
    self.deferred.done(function(){
        deferred.resolve(self.canvas.get_data_url());
    });

    return deferred;
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
                        rgb = [whole_canvas_result.data[i], whole_canvas_result.data[i+1], whole_canvas_result.data[i+2], whole_canvas_result.data[i+3]];
                    }else{
                        // process this px now
                        rgb = layer.filter.process(i, [self.pixels.data[i], self.pixels.data[i+1], self.pixels.data[i+2]]);
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
                        opacity = opacity * (mask_pixels.data[i]/255);
                    }
                    // * opacity of this whole layer
                    opacity = opacity * (layer.opacity/100);

                    // blend this layer with underlying
                    rgb = layer.blender.process(
                        [self.pixels.data[i], self.pixels.data[i+1], self.pixels.data[i+2]],
                        [rgb[R], rgb[G], rgb[B]],
                        opacity
                    );
                    self.pixels.data[i  ] = rgb[R];
                    self.pixels.data[i+1] = rgb[G];
                    self.pixels.data[i+2] = rgb[B];
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

    self.elements.overlay.find('.fx-text-old').remove();

    self.canvas.put_data(self.pixels);
    if(!self.render_options.output){
        self.update_element();
    }
    self.deferred.resolve();

    $(document.body).removeClass('fx-processing');

    if((self.options.render_text === false && !self.render_options.render_text && !self.render_options.output) || (self.render_options.editable && !self.options.disable_text_edit)){
        self.without_extras = self.canvas.clone();
    }

    if(debug_logging){ console.timeEnd('writing data back'); }

    if(debug_logging){ console.groupEnd(self.current_filter); }
};

// removes stickers/text from render and displays their html overaly elements
SnaprFX.prototype.unrender_editables = function(){  var self = this;

    if(!self.options.disable_sticker_edit){
        $.each(self.stickers, function(i, sticker){
            sticker.unrender();
        });
    }

    if(!self.options.disable_text_edit){
        $.each(self.text, function(i, text){
            text.unrender();
        });
    }

    if(self.without_extras){
        self.canvas.context.drawImage(self.without_extras.canvas, 0, 0);
        self.update_element();
    }else{
        self.apply_filter({editable: true});
    }
};

// replaces stickers/text in render and hides their html overaly elements
SnaprFX.prototype.rerender_editables = function(){  var self = this;

    // revert to orig with no stickers
    self.apply_filter({editable: false});

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
            if(!$(event.target).closest('.fx-text-wrapper').length){ // if click wasn't on a text el

                if(self.render_options.editable && !$(event.target).closest('.fx-sticker').length){
                    self.rerender_editables();
                }
                if(self.active_text){
                    self.active_text.deactivate();
                }
            }
        });
    self.elements.wrapper = $('<div class="fx-wrapper">').css({
        position: 'relative',
        height: self.options.height,
        width: self.options.width
    });

    // put wrapper on page
    self.elements.wrapper.insertAfter(self.elements.image);

    // put elements in wrapper
    self.elements.image.appendTo(self.elements.wrapper);
    self.elements.overlay.appendTo(self.elements.wrapper);

    self.elements.overlay.offset_cache = self.elements.overlay.offset();
};


// require.js module
// -----------------

if ( typeof define === "function" && define.amd ) {
    define(function(){return SnaprFX;});
}
