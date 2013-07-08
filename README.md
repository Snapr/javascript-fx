Preloading
-------------

In order to speed up applying filters assets can be preloaded

    SnaprFX.utils.preload_assets({
        filter_pack: "path/to/filter-pack-directory/",
        sticker_pack: "path/to/sticker-pack-directory/"
    });


Initialization
-----------------

    image = new SnaprFX({
        url: src,  // path to original
        element: img,  // element to display results
        width: 400,  // output width
        height: 600,  // output height
        filter_pack: "path/to/filter-pack-directory/",
        sticker_pack: "path/to/sticker-pack-directory/",
        text: {  // specify initial values for text fields
            title: "The Sneeches",
            author: "Dr SeuSs"
        },
        render_text: false  // If false text not be automatically rendered
                            // with filters it will be previewed as css overlay
        more
    });

Two deferred objects are available for callbacks

    image.load_filter_pack.done
    image.load_sticker_pack.done


Apply filters
-------------

    image.apply_filter({
        filter: "slug",
        render_text: true,  // override render_text option
        editable: false,  // if false text and sticker elements are forced to render
        width: 200,  // override width
        height: 300,  // override height
        region: {left: 100, top: 100, width: 100, height: 100}  // render only specified region
    });


Alternate Output Size
---------------------

    image.output({
        width: 560,
        height: 750
    });

Output ready:

    output.done(function(url){ /* display or use url */ });


Change source image
----------------------

    image.set_url(new_src).done(function(){
        // new src loaded
        image.deferred.done(function(){
            // filter applied with new src
        });
    });


5. Text
-------


    $('.fx-text').live('activate', function(e, data){

    image.active_text.change_style({
        'font-family': $('.font').val(),
        'font-size': $('.font-size').val()+'px',
        'line-height': $('.font-size').val()*$('.fx-active .fx-text-inner').data('line-height-multiplier')+'px',
        'font-weight': $('#x-text-bold').attr('checked') ? 'bold' : 'normal',
        'font-style': $('#x-text-italic').attr('checked') ? 'italic' : 'normal',
        'color': $('.other-color').val(),
        'text-align': $('[name=x-text-align]:checked').val()
    });

    image.set_options({disable_text_edit: $(this).is(':checked')});
    image.set_options({disable_sticker_edit: $(this).is(':checked')});
    image.set_options({render_text: $(this).is(':checked')});


    image.add_text({
        "type": "text",
        "slug": "custom",
        "name": "Custom Text",
        "opacity": 100,
        "blending_mode": "normal",
        "mask_image": false,
        "text": {
            "default_value": "New Text",
            "style": {
                "font": style + ' ' + weight +' '+size+'/'+lineheight+' '+font,
                "textAlign": $('[name=x-text-align]:checked').val(),
                "fillStyle": $('.other-color').val(),
                "textBaseline": "top"
            }
        },
        "position": {
            "dragable": true
        }
    });


How to
------

Apply a filter

    image.apply_filter({filter: "slug"});


Preview with rext rendered when render_text = false

    image.apply_filter({render_text: true, editable:false});
