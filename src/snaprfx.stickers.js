// create a new sticker
/** @expose */
SnaprFX.prototype.add_sticker = function(slug){  var self = this;

    var sticker = new SnaprFX.sticker(slug, self);
    self.stickers.push(sticker);
    sticker.deferred.done(function(){
        self.elements.overlay.append(sticker.element);
        sticker.element
            .addClass('fx-active')
            .siblings('.fx-active').removeClass('fx-active');
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

    self.scale = 1;
    self.rotation = 0;

    self.spec = parent.sticker_pack.by_slug[slug];

    self.deferred = $.Deferred();

    self.load().done(function(){

        self.scale_factor = Math.min(parent.canvas.width / parent.sticker_pack.target_canvas.width, parent.canvas.height / parent.sticker_pack.target_canvas.height);

        // Build element
        // -------------

        var html = '<div class="fx-sticker fx-sticker-rendered">';
            html += '<a class="fx-remove-sticker fx-sticker-handle" data-role="button" data-icon="delete" data-iconpos="notext" data-theme="e">✗</a>';
            html += '<a class="fx-render-sticker fx-sticker-handle" data-role="button" data-icon="tick" data-iconpos="notext" data-theme="e">✔</a>';
            html += '<a class="fx-scale-sticker fx-sticker-handle" data-role="button" data-icon="rotate" data-iconpos="notext" data-theme="e"> </a>';

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

        self.initial = css;

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
            if(self.parent.options.disable_sticker_edit){
                return;
            }
            if(self.rendered){
                parent.unrender_editables();
            }
            self.element
                .addClass('fx-active')
                .removeClass('fx-sticker-rendered')
                .siblings('.fx-active').removeClass('fx-active');
        });

        // dragging
        // --------

        // move
        self.mousemove_drag = function(event){
            if(!self.rendered){
                self.element.css({
                    left: event.pageX - self.drag_from.left,
                    top: event.pageY - self.drag_from.top
                });
            }
        };

        // finish drag
        self.mouseup = function(){
            parent.elements.wrapper.off('mousemove', self.mousemove_drag);
            parent.elements.wrapper.off('mousemove', self.mousemove_scale);
        };
        parent.elements.wrapper.on('mouseup', self.mouseup);

        // start drag
        self.element.on('mousedown', function(event) {
            if(!self.rendered){

                var left = parseInt(self.element.css('left'), 10);
                var top = parseInt(self.element.css('top'), 10);

                self.drag_from = {
                    left: event.pageX - left,
                    top: event.pageY - top,
                    event: event
                };
                parent.elements.wrapper.on('mousemove', self.mousemove_drag);
            }

            parent.elements.overlay
                .addClass('fx-editing-sticker')
                .removeClass('fx-editing-text');
        });

        // Scaling
        // -------

        self.mousemove_scale = function(event){
            event.stopPropagation();
            if(!self.rendered){

                var distance = SnaprFX.utils.pythag(event.pageX-self.scale_from.x, event.pageY-self.scale_from.y);
                self.scale = distance/self.scale_from.size;
                self.scale = Math.max(self.scale, 0.15);

                var rotation = SnaprFX.utils.cart2polar(event.pageX-self.scale_from.x, event.pageY-self.scale_from.y);

                self.rotation = -self.scale_from.rotation+rotation;

                var width = self.initial.width * self.scale;
                var height = self.initial.height * self.scale;

                self.element.css({
                    transform: 'rotate('+(self.rotation/(2*Math.PI) * 360)+'deg)',
                    width: width,
                    height: height,
                    top: self.scale_from.y - height/2 - self.parent.elements.overlay.offset_cache.top,
                    left: self.scale_from.x - width/2 - self.parent.elements.overlay.offset_cache.left
                });
            }
        };

        // start scale
        self.element.find('.fx-scale-sticker').on('mousedown', function(event) {
            event.stopPropagation();
            window.element=self.element;
            if(!self.rendered){
                var dimensions = self.get_dimensions();
                var offset = self.element.find('.fx-sticker-image').offset();
                //var position = self.element.position();
                self.scale_from = {

                    // remember where the center is, the change in mouse distance/angle from this is scale/rotation
                    x: offset.left + dimensions.width / 2,
                    y: offset.top + dimensions.height / 2,
                    // remember distance from center to corner, change in this = change in scale
                    size: SnaprFX.utils.pythag(self.element.height(), self.element.width()) / 2 / self.scale,
                    // remember current scale so new scale can be proportional
                    scale: self.scale
                };
                // remember current rotation to apply change in rotation on top of
                self.scale_from.rotation = SnaprFX.utils.cart2polar(event.pageX-self.scale_from.x, event.pageY-self.scale_from.y) - self.rotation;

                parent.elements.wrapper.on('mousemove', self.mousemove_scale);
            }
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
        w = sticker.width() / layer.width() * canvas.width,
        h = sticker.height() / layer.height() * canvas.height;

        var r = self.rotation, PI = Math.PI;
        if(r>2*PI){r-=2*PI;}
        if(r<0){r+=2*PI;}
        var sin = Math.sin(r);
        var cos = Math.cos(r);

        if(r < PI/2){  // < 90
            x += sin*h / canvas.width;
        }else if(r > PI*1.5){  // > 270
            y += -sin*w / canvas.height;
        }else if(r > PI/2 && r < PI){  // > 90
            x += (sin*h + -cos*w) / canvas.width;
            y += -cos*h / canvas.height;
        }else{  // > 180
            x += -cos*w / canvas.width;
            y += (-cos*h - sin*w) / canvas.height;
        }

    self.load().done(function() {
        // place sticker
        canvas.context.translate(x * canvas.width, y * canvas.height);
        canvas.context.rotate(self.rotation);
        canvas.context.drawImage(self.image, 0,0, self.image.width, self.image.height ,0 ,0 ,w ,h);
        canvas.context.rotate(-self.rotation);
        canvas.context.translate(-x * canvas.width, -y * canvas.height);
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
SnaprFX.sticker.prototype.get_dimensions = function(){  var self = this;
    return SnaprFX.utils.rotated_dimensions(self.element.width(), self.element.height(), -self.rotation);
};
