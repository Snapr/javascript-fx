/*global SnaprFX: false, JpegMeta: false */

// dom manipulation utils
var dom = {};
dom.div = function(className){
    var element = document.createElement('div');
    element.className = className;
    return element;
};


dom.hasClass = function(element, className){
    return element.className.match(RegExp('(^|\\s)' + className + '(\\s|$)'))
};
dom.addClass = function(element, className){
    if(!dom.hasClass(element, className)){
        element.className += ' ' + className;
    }
};
dom.removeClass = function(element, className){
    element.className = element.className.replace(RegExp('(^|\\s)' + className + '(\\s|$)'), ' ');
};

dom.setStyle = function(element, style){
    for(var property in style){
        element.style[property] = style[property];
    }
};

function Deferred(){
    this.callbacks = [];
}
Deferred.prototype.resolve = function(data){
    this.resolved = true;
    this.data = data;
    this.callbacks.forEach(function(callback){
        callback(data);
    });
    return this;
};
Deferred.prototype.done = function(callback){
    if(this.resolved){
        callback(this.data);
    }else{
        this.callbacks.push(callback);
    }
    return this;
};

/** @expose */
SnaprFX.utils = {
    compatible: function(){
        var elem = document.createElement('canvas');
        return !!(elem.getContext && elem.getContext('2d'));
    },
    rotated_dimensions: function(w,h,r){
        var width  = Math.abs(Math.cos(r)*w) + Math.abs(Math.sin(r)*h);
        var height = Math.abs(Math.sin(r)*w) + Math.abs(Math.cos(r)*h);
        return {width:width,height:height};
    },
    cart2polar: function(x,y){
        var rotation = Math.atan(y / x);
        if(y>0){
            if(x<0){
                rotation = Math.PI + rotation;
            }
        }else{
            if(x<0){
                rotation = Math.PI + rotation;
            }else{
                rotation = Math.PI*2 + rotation;
            }
        }
        return rotation;
    },
    pythag: function(x,y){
        return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
    },
    /** @expose */
    preload_assets: function(options){
        var filter_pack, sticker_pack;
        var filter_pack_request = new XMLHttpRequest();
        filter_pack_request.onload = function(){
            JSON.parse(filter_pack_request.response).filter_pack.sections.forEach( function(section){
                section.filters.forEach( function(filter){

                    var filter_path = options.filter_pack    + 'filters/' + filter.slug + '/';
                    // get filter details
                    var filter_request = new XMLHttpRequest();
                    filter_request.onload = function(){
                        var data = JSON.parse(filter_request.response);
                        if(data.filter.fonts){
                            data.filter.fonts.forEach( function(font){

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

                                var style = document.createElement('style');
                                style.innerHTML = css;
                                document.body.appendChild(style);

                                // use font on page so it's preloaded
                                var font_span = document.createElement('span');
                                font_span.style.fontFamily = font['font-family'];
                                document.body.appendChild(font_span);

                            });
                        }

                        data.filter.layers.forEach( function(layer){
                            if(layer.type == 'image'){
                                var image = new Image();
                                image.src = filter_path+layer.image.image;
                            }
                        });
                    };
                    filter_request.open("get", filter_path + 'filter.json', true);
                    filter_request.send();
                });
            });
        };
        filter_pack_request.open("get", options.filter_pack + 'filter-pack.json', true);
        filter_pack_request.send();
        var sticker_request = new XMLHttpRequest();
        sticker_request.onload = function(){
            JSON.parse(sticker_request.response).sticker_pack.sections.forEach( function(section){
                section.stickers.forEach( function(sticker){
                    var image = new Image();
                    image.src = options.sticker_pack+'assets/'+sticker.slug+'.png';
                });
            });
        };
        sticker_request.open("get", options.sticker_pack + 'sticker-pack.json', true);
        sticker_request.send();
    },

    // Reads EXIF from a file identified by 'url'
    // Returns Deferred which resolves with selected EXIF properties
    read_exif: function(url){

        var deferred = new Deferred();

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
