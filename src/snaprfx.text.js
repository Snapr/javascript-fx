/*global SnaprFX: false */

var debug_borders = false;

SnaprFX.prototype.add_text = function(spec){  var self = this;
    spec.filter = new SnaprFX.filters.text(spec, self) ;
    self.filter_specs[self.current_filter].layers.push(spec);
};

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

    self.update(layer, fx);

};

SnaprFX.filters.text.prototype.calculate_position = function(layer, fx){  var self = this;

    if(fx.filter_specs[fx.current_filter].target_canvas){
        self.x_scale_factor = self.canvas.width / fx.filter_specs[fx.current_filter].target_canvas.width;
        self.y_scale_factor = self.canvas.height / fx.filter_specs[fx.current_filter].target_canvas.height;
    }else{
        self.x_scale_factor = self.y_scale_factor = 1;
    }

    if(layer.position && layer.position.bbox){
        self.position = {
            top: layer.position.bbox.top * self.y_scale_factor,
            bottom: layer.position.bbox.bottom * self.y_scale_factor,
            left: layer.position.bbox.left * self.x_scale_factor,
            right: layer.position.bbox.right * self.x_scale_factor
        };
    }else{
        self.position = {
            top: 0,
            bottom: self.canvas.height,
            left: 0,
            right: self.canvas.width
        };
    }

    if(layer.position){
        self.position.x = layer.position.x * self.x_scale_factor;
        self.position.y = layer.position.y * self.y_scale_factor;
    }

    self.bbox = {
        top: self.position.top,
        bottom: self.position.bottom,
        left: self.position.left,
        right: self.position.right
    };
};


SnaprFX.filters.text.prototype.set_canvas_font = function(){  var self = this;
    self.text_element.css('font-size', parseInt(self.text_element.css('font-size'), 10) * self.render_scale);
    self.text_element.css('line-height', parseInt(self.text_element.css('line-height'), 10) * self.render_scale + 'px');
    self.canvas.context.font = self.text_element.css('font');
    self.text_element.css('font-size', parseInt(self.text_element.css('font-size'), 10) / self.render_scale);
    self.text_element.css('line-height', parseInt(self.text_element.css('line-height'), 10) / self.render_scale + 'px');
};

SnaprFX.filters.text.prototype.update = function(layer, fx){  var self = this;

    self.rendered = (fx.options.render_text !== false || fx.render_options.render_text || fx.render_options.output) && (!fx.render_options.editable || fx.options.disable_text_edit);
    self.spec = layer;
    self.dragable = layer.position && layer.position.dragable;
    self.deferred = $.Deferred();

    self.canvas.set_size(fx.canvas.width, fx.canvas.height);
    self.canvas.clear();

    self.calculate_position(layer, fx);

    self.create_overlay(layer, fx);

    // update text from overlay

    // strip HTML, replace <br> with newlines
    self.text = self.text_element.html()
        .replace(/<br\/?>/g, '\n')  // <br> to newline
        .replace(/&nbsp;/g, ' ')  // non-breking space to normal space
        .replace(/<.*?>/g, '');  // strip html tags

    // but back stripped text with <br>s for newlines
    self.text_element.html(self.text.replace(/\n/g, '<br>'));

    self.text_style.fillStyle = self.text_element.css('color');
    self.text_style.textAlign = self.element.css('text-align');

    self.render_scale = self.canvas.height / fx.elements.overlay.height();

    // set font properties on canvas
    self.set_canvas_font();
    self.canvas.context.textAlign = self.text_style.textAlign || 'left';
    self.canvas.context.textBaseline = self.text_style.textBaseline || 'top';
    self.canvas.context.fillStyle = self.text_style.fillStyle;

    self.text_style.fontSize = parseInt(self.text_element.css('font-size'), 10);
    self.text_style.lineHeight = parseInt(self.text_element.css('line-height'), 10);

    // wrapping
    // --------

    var position = self.element.position();
    self.position.left = position.left;
    self.position.top = position.top;
    self.position.right = position.left + self.element.width();
    self.position.bottom = position.top + self.element.height();

    var max_width = self.position.right - self.position.left,
        max_height = Math.round(self.position.bottom - self.position.top);

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
    var finite = 1000;
    while(finite && (!lines || (lines.length - 1) * self.text_style.lineHeight + self.text_style.fontSize > max_height)){
        finite--;


        self.text_style.fontSize = self.text_style.fontSize * 0.8;
        self.text_element.css('font-size', self.text_style.fontSize);

        self.text_style.lineHeight = self.text_style.lineHeight * 0.8;
        self.text_element.css('line-height', self.text_style.lineHeight+ 'px');

        self.set_canvas_font();

        lines = word_wrap(self.text, max_width);

    }
    if(!finite){ console.warn('render shrunk text 1000 times without success!'); }


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
    x = x * self.render_scale;

    // set y position for text based on alignment
    switch(self.text_style.textBaseline){
        case 'hanging':
        case 'alphabetic':
        case 'ideographic':
        case 'bottom':
            // start No. of extra lines up from bottom
            y = self.position.bottom - (self.text_style.lineHeight * (lines.length - 1));
            break;
        case 'middle':
            y = (max_height / 2 + self.position.top) - ((self.text_style.lineHeight * (lines.length - 1)) / 2);
            break;
        default:  // top
            // start at top
            y = self.position.top;

    }
    y = y * self.render_scale;

    // draw text
    // ---------

    if(self.slug !== fx.render_options.active_text && !layer.removed){

        for(var l=0; l < lines.length; l++){

            if(debug_borders){
                // draws bounding box
                self.canvas.context.strokeRect(
                    self.position.left * self.x_scale_factor*self.render_scale,
                    y+l*self.text_style.lineHeight*self.render_scale,
                    max_width*self.render_scale,
                    self.text_style.lineHeight*self.render_scale
                );
            }

            self.canvas.context.fillText(lines[l], x, y+l*self.text_style.lineHeight*self.render_scale, max_width);

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

    var css = {
        position: 'absolute',
        left: self.position.left,
        top: self.position.top,
        width: self.position.right - self.position.left,
        height: self.position.bottom - self.position.top,
        'text-align': self.text_style.textAlign
    };

    if(self.position.x){
        switch(self.text_style.textAlign){
            case 'end':
            case 'right':
                css.width = self.position.x;
                break;
            case 'center':
                // if text is centered closer to left than right
                if(self.position.right - self.position.x < self.position.x - self.position.left){
                    css.width = (self.position.right - self.position.x) * 2;
                    css.left = self.position.right - css.width;
                }else{
                    css.width = (self.position.x - self.position.left) * 2;
                }
                break;
            default:  // left, start
                css.left = self.position.x;
                css.width = self.position.right - self.position.x;
        }
    }

    if(self.position.y){
        switch(self.text_style.textBaseline){
            case 'hanging':
            case 'alphabetic':
            case 'ideographic':
            case 'bottom':
                css.height = self.position.y;
                break;
            case 'middle':
                // if text is centered closer to top than bottom
                if(self.position.bottom - self.position.y < self.position.y - self.position.top){
                    css.height = (self.position.bottom - self.position.y) * 2;
                    css.top = self.position.bottom - css.height;
                }else{
                    css.height = (self.position.y - self.position.top) * 2;
                }
                break;
            default:  // top
                css.top = self.position.y;
                css.height = self.bbox.bottom - css.top;
        }
    }

    css['line-height'] = css.height + 'px';


    self.element  = $('<div class="fx-text">')
    .css(css);

    if(self.rendered && (fx.options.render_text !== false || fx.render_options.render_text)){
        self.element.addClass('fx-text-rendered');
    }

    self.wrapper = $('<div class="fx-text-wrapper">').css({'line-height': 'normal', 'vertical-align': self.text_style.textBaseline});

    self.text_element  = $('<div class="fx-text-inner" data-layer="'+self.slug+'">')
    .css({
        font: self.text_style.font,
        color: self.text_style.fillStyle
    })
    .text(self.text)
    .on('mousedown', function(){

        if(fx.options.disable_text_edit){
            return;
        }

        var active = self.element.hasClass('fx-active'),
            rendered = self.element.hasClass('fx-text-rendered');

        // deactivate all other text layers
        var to_deactivate = self.overlay.find('.fx-active')    // find active text
            .not(self.element);   // not this one though

        if(to_deactivate.length){
            self.deactivate(to_deactivate);
            fx.active_text = null;
        }


        // activate if not already active
        if(!active){
            self.element
                .addClass('fx-active')
                .removeClass('fx-text-rendered')
                .trigger('activate', layer);

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
    .on('dblclick', function(){
        self.editable = true;
        self.element.addClass('fx-editable');
        self.text_element
            .attr('contenteditable', true)
            .focus();

        var range,selection;
        if(document.createRange)//Firefox, Chrome, Opera, Safari, IE 9+
        {
            range = document.createRange();//Create a range (a range is a like the selection but invisible)
            range.selectNodeContents(self.text_element.get(0));//Select the entire contents of the element with the range
            range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
            selection = window.getSelection();//get the selection object (allows you to change selection)
            selection.removeAllRanges();//remove any selections already made
            selection.addRange(range);//make the range you have just created the visible selection
        }
        else if(document.selection)//IE 8 and lower
        {
            range = document.body.createTextRange();//Create a range (a range is a like the selection but invisible)
            range.moveToElementText(self.text_element.get(0));//Select the entire contents of the element with the range
            range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
            range.select();//Select the range (make it the visible selection
        }

    })
    .on('keyup', function(){
        self.check_size();
    });

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
                top: 0,
                right: 0
            })
            // trigger render
            .click(function(){
                if(fx.options.render_text !== false || fx.render_options.render_text){
                    fx.rerender_editables();
                }else{
                    self.deactivate();
                }
            })
    );

    // dragging
    // --------

    if(self.dragable){

        // move
        self.mousemove_drag = function(event){
            if(!self.rendered && !self.editable){
                var css = {};

                var drag_center, new_center;

                // set x position for text based on alignment
                var max_width = self.bbox.right - self.bbox.left;
                switch(self.text_style.textAlign){
                    case 'end':
                    case 'right':
                        css.width =  Math.min(event.pageX + self.drag_from.right - self.bbox.left, max_width);
                        break;
                    case 'center':
                        drag_center = (self.drag_from.right - self.drag_from.left) / 2;
                        new_center = event.pageX + drag_center + self.bbox.left;

                        css.width = ((new_center - self.bbox.left) - self.bbox.left) * 2;

                        if(css.width > max_width){
                            css.left = self.bbox.left + (css.width - max_width);
                            css.left = Math.min(css.left, self.bbox.left + max_width);
                            css.width = max_width - (css.left - self.bbox.left);
                        }
                        break;
                    default:  // left, start
                        css.left = Math.max(self.bbox.left, event.pageX - self.drag_from.left);
                        css.width =  self.bbox.right - css.left;

                }

                // set y bbox for text based on alignment
                var max_height = self.bbox.bottom - self.bbox.top;
                var current_height = self.text_element.innerHeight() - 18;
                switch(self.text_style.textBaseline){
                    case 'hanging':
                    case 'alphabetic':
                    case 'ideographic':
                    case 'bottom':
                        css.height =  Math.min(event.pageY + self.drag_from.bottom - self.bbox.top, max_height);
                        break;
                    case 'middle':
                        drag_center = (self.drag_from.bottom - self.drag_from.top) / 2;
                        new_center = event.pageY + drag_center + self.bbox.top;

                        // height  = distance  ((  from center   )   to top       ) * 2
                        css.height = ((new_center - self.bbox.top) - self.bbox.top) * 2;

                        // if the new height it too tall the new center must
                        // be closer to the bottom of the box than the top
                        if(css.height > max_height){
                            // top is equal to the overflowing portion
                            css.top = self.bbox.top + (css.height - max_height);
                            // top can't be so bit there is no room for text
                            css.top = Math.min(css.top, self.bbox.top + max_height - self.text_style.lineHeight);
                            // height takes up the rest of the bbox
                            css.height = max_height - (css.top - self.bbox.top);
                        }
                        break;
                    default:  // top
                        css.top = Math.min(self.bbox.bottom - current_height, event.pageY - self.drag_from.top);
                        css.top = Math.max(self.bbox.top, css.top);
                        css.height = self.bbox.bottom - css.top;
                }
                // height must be more then lineHeight
                css.height = Math.max(css.height, self.text_style.lineHeight);

                css['line-height'] = css.height + 'px';

                self.element.css(css);
            }
        };

        // finish drag
        self.mouseup = function(){
            fx.elements.wrapper.off('mousemove', self.mousemove_drag);
        };
        fx.elements.wrapper.on('mouseup', self.mouseup);

        // start drag
        self.element.on('mousedown', function(event) {
            if(!self.rendered){

                var left = parseInt(self.element.css('left'), 10);
                var top = parseInt(self.element.css('top'), 10);
                var width = parseInt(self.element.css('width'), 10);
                var height = parseInt(self.element.css('height'), 10);

                self.drag_from = {
                    left: event.pageX - left,
                    right: (left+width) - event.pageX,
                    top: event.pageY - top,
                    bottom: (top+height) - event.pageY,
                    event: event
                };
                fx.elements.wrapper.on('mousemove', self.mousemove_drag);
            }

            fx.elements.overlay
                .addClass('fx-editing-text')
                .removeClass('fx-editing-sticker');
        });
    }



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


    var finite = 1000;
    while(finite && (self.text_element.width() > self.element.width() || self.text_element.height() > Math.round(self.element.height()))){
        finite--;

        self.text_style.fontSize = self.text_style.fontSize * 0.99;
        self.text_element.css('font-size', self.text_style.fontSize);

        self.text_style.lineHeight = self.text_style.lineHeight * 0.99;
        self.text_element.css('line-height', self.text_style.lineHeight+ 'px');

    }
    if(!finite){ console.warn('check_size shrunk text 1000 times without success!'); }

};

SnaprFX.filters.text.prototype.remove = function(){  var self = this;
    self.element.hide();
    self.spec.removed = true;
};
SnaprFX.filters.text.prototype.unrender = function(){  var self = this;
    self.element.removeClass('fx-text-rendered');
};
SnaprFX.filters.text.prototype.rerender = function(){  var self = this;
    self.element.addClass('fx-text-rendered');
};

SnaprFX.filters.text.prototype.deactivate = function(elements){  var self = this;
    (elements || self.element)
        .removeClass('fx-editable')
        .removeClass('fx-active')      // make inactive...
        .trigger('deactivate')
        .find('.fx-text-inner')
            .attr('contenteditable', false);
    self.editable = false;
};

SnaprFX.filters.text.prototype.process = function(i, rgb){  var self = this;
    if(!self.rendered){ return [0,0,0,0]; }
    return [self.pixels.data[i], self.pixels.data[i+1], self.pixels.data[i+2], self.pixels.data[i+3]];
};
