Preloading
----------

In order to speed up applying filters assets can be preloaded

    SnaprFX.utils.preload_assets({
        filter_pack: "path/to/filter-pack-directory/",
        sticker_pack: "path/to/sticker-pack-directory/"
    });


Browser compatiblity
--------------------

`SnaprFX.utils.compatible` returns true or false

    if(!SnaprFX.utils.compatible()){ ... }


Initialization
--------------

    MyImageInstance = new SnaprFX(options);


##### options

- url: path to original image
- element: img element to output to
- width: output width
- height: output height
- filter_pack: path/to/filter-pack-directory/
- sticker_pack: path/to/sticker-pack-directory/
- text: initial values for text fields. eg. `{ title: "The Sneeches", author: "Dr Seuss" }`
- render_text: If false text not be automatically rendered with filters it will be previewed as css overlay


##### Deferred

Two deferred objects are available for callbacks

    MyImageInstance.load_filter_pack
    MyImageInstance.load_sticker_pack


Apply filters
-------------

    MyImageInstance.apply_filter({
        filter: "slug",
        render_text: true,  // override render_text option
        editable: false,  // if false text and sticker elements are forced to render
        width: 200,  // override width
        height: 300,  // override height
        region: {left: 100, top: 100, width: 100, height: 100}  // render only specified region
    });


Alternate Output Size
---------------------

To output (uneditable) image, for example as final output or thumbnail

    MyImageInstance.output({
        width: 560,
        height: 750
    });

Output ready:

url is full image data as [Data URI Scheme](https://en.wikipedia.org/wiki/Data_URI_scheme)


    output.done(function(url){
        // display or use url
        ...
    });


Change source image
----------------------

    MyImageInstance.set_url(new_src);


Text
----

### Activation

When the user clicks some text and it becomes active a custom event is fired on
the text emement with details about the text. The data object format matches
text layers in filter json.

    $('.fx-text').live('activate', function(event, data){
        // data represents properties of activated text
    }));



### change styles

To update the style of the active text layer call change_style on it:

    MyImageInstance.active_text.change_style(options);

##### options

All optional

- font-family
- font-size (px)
- line-height (px)
- font-weight
- font-style
- color
- text-align



### Disable/enable text or sticker editing

Stop text or sticker elements being activates so that the user can edit the other
type unhindered.

    MyImageInstance.set_options({disable_text_edit: bool});
    MyImageInstance.set_options({disable_sticker_edit: bool});


### render text while working

    MyImageInstance.set_options({render_text: bool});


### add text

Add a text layer.
options format matches text layers in filter json.

    MyImageInstance.add_text(options);



How to
------

Apply a filter

    MyImageInstance.apply_filter({filter: "slug"});


Preview with rext rendered when render_text = false

    MyImageInstance.apply_filter({render_text: true, editable:false});
