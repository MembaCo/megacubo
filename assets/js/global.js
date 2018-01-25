var gui = require('nw.gui');
    
/*
try {
    import {setInterval, clearInterval} from 'timers';
} catch(e) {
    console.error(e)
}
*/

setTimeout = global.setTimeout.bind(global);
clearTimeout = global.clearTimeout.bind(global);

// prevent default behavior from changing page on dropped file
window.ondragover = function(e) { 
    if(e){
        e.preventDefault();
    }
    if(top == window){
        var ov = document.querySelector('iframe#overlay');
        if(ov) ov.style.pointerEvents = 'all';
    } else {
        top.ondragover();
    }
    return false
};

window.ondragleave = window.ondrop = function(e) { 
    if(e){
        e.preventDefault(); 
    }
    setTimeout(() => {
        var ov = document.querySelector('iframe#overlay');
        if(ov) ov.style.pointerEvents = 'none';
    }, 200);
    return false;
};

window.onerror = (...arguments) => {
    console.log('ERROR', arguments);
    top.logErr(arguments);
    return true;
}

if(typeof(require)!='undefined'){

    var fs = require("fs"), Store = (() => {
        var dir = 'data/', _this = {};
        fs.stat(dir, function(err, stat){
            if(err !== null) {
                fs.mkdir(dir);
            }
        });
        var resolve = function (key){
            return dir+key+'.json';
        };
        var prepareKey = function (key){
            return key.replace(new RegExp('[^A-Za-z0-9\\._-]', 'g'), '');
        };
        _this.get = function (key){
            if(!localStorage) return; // randomly undefined ?!
            key = prepareKey(key);
            var _json = localStorage.getItem(key);
            if(_json === null){
                var f = resolve(key); 
                if(fs.existsSync(f)){
                    _json = fs.readFileSync(f, "utf8");
                }
            }
            if(_json !== null){
                try {
                    var r = JSON.parse(_json);
                    return r;
                } catch(e){};
            }
            return null;
        };
        _this.set = function (key, val){
            if(!localStorage) return;
            key = prepareKey(key);
            val = JSON.stringify(val);
            //console.log('WRITE '+key+' '+val);
            localStorage.setItem(key, val);
            fs.writeFile(resolve(key), val, "utf8");
        };
        return _this;
    })();

    var DB = (() => {

        var _this = this;

        _this.maximumExpiral = 30 * (24 * 3600);

        _this.set = function (key, jsonData, expirationSec){
            if (typeof(localStorage) == "undefined" || !localStorage) { return false; }
            key = _this.prepare(key);
            var expirationMS = expirationSec * 1000;
            var record = {value: JSON.stringify(jsonData), expires: new Date().getTime() + expirationMS}
            localStorage.setItem(key, JSON.stringify(record));
            return jsonData;
        };

        _this.get = function(key){
            if (typeof(localStorage) == "undefined") { return false; }
            key = _this.prepare(key);
            var v = localStorage.getItem(key);
            if(!v) return false;
            var record = JSON.parse(v);
            if (!record){return false;}
            return (new Date().getTime() < record.expires && JSON.parse(record.value));
        };

        _this.prepare = function (key){
            return key.replace(new RegExp('[^A-Za-z0-9\._-]', 'g'), '');
        };

        var toRemove = [], currentDate = new Date().getTime();
        for (var i = 0, j = localStorage.length; i < j; i++) {
            var key = localStorage.key(i), current = localStorage.getItem(key);
            if (current && /^\{(.*?)\}$/.test(current)) {
                current = JSON.parse(current);
                if (current.expires && current.expires <= currentDate) {
                    toRemove.push(key);
                }
            }
        }
        // Remove itens que já passaram do tempo
        // Se remover no primeiro loop isto poderia afetar a ordem,
        // pois quando se remove um item geralmente o objeto ou array são reordenados
        for (var i = toRemove.length - 1; i >= 0; i--) {
            localStorage.removeItem(toRemove[i]);
        }

        return _this;
    })();

    /*
    DB.set('test', 'ok', 5);
    alert(DB.get('test'));
    setTimeout(() => {
        alert(DB.get('test'));
        alert(DB.prepare('test_&¨%#&try'));
    }, 6000);

    jQuery(() => {
        Store.set('test', [3, 2]);
        console.log(Store.get('test'));
    });
    */

    String.prototype.replaceAll = function(search, replacement) {
        var target = this;
        return target.split(search).join(replacement);
    };

    // First, checks if it isn't implemented yet.
    if (!String.prototype.format) {
        String.prototype.format = function (){
            var args = arguments;
            return this.replace(/{(\d+)}/g, function(match, number) { 
            return typeof args[number] != 'undefined'
                ? args[number]
                : match
            })
        }
    }

    function sliceObject(object, s, e){
        var ret = {};
        if(object){
            var keys = Object.keys(object).slice(s, e);
            for(var i=0; i<keys.length; i++){
                ret[keys[i]] = object[keys[i]];
            }
        }
        return ret;
    }

    function findCircularRefs(o){
        var cache = [];
        JSON.stringify(o, function(key, value) {
            if (typeof value === 'object' && value !== null) {
                if (cache.indexOf(value) !== -1) {
                    console.log('Circular reference found:', key, value);
                    return;
                }
                // Store value in our collection
                cache.push(value);
            }
            return value;
        });
        cache = null;
    }

    var currentScaleMode = 0, scaleModes = ['contain', 'cover', 'fill'];
    function changeScaleMode(){
        if(top.PlaybackManager.activeIntent){
            var v = top.PlaybackManager.activeIntent.videoElement;
            if(v){
                currentScaleMode++;
                if(currentScaleMode >= scaleModes.length){
                    currentScaleMode = 0;
                }
                v.style.objectFit = scaleModes[currentScaleMode];
                notify('Scale mode: '+scaleModes[currentScaleMode], 'fa-expand', 'short')
            }
        }
    }
    
    function seekRewind(){
        notify(Lang.REWIND, 'fa-backward', 'short');
        top.PlaybackManager.seek(-10)
    }

    function seekForward(){
        notify(Lang.FORWARD, 'fa-forward', 'short');
        top.PlaybackManager.seek(10)
    }
    
    function collectListQueue(ref){
        var container = getListContainer(false);
        var as = container.find('a.entry-stream');
        var queue = [], ok = false;
        for(var i=0; i<as.length; i++){
            var s = as.eq(i).data('entry-data');
            if(s.url == ref.url || (typeof(ref.originalUrl)!='undefined' && s.url == ref.originalUrl)){
                top.packageQueueCurrent = i;
                ok = true;
            }
            queue.push(s)
        }
        if(ok){
            top.packageQueue = queue;
        }
    }
    
    function getPreviousStream(){
        if(top.packageQueue.length > 1){
            var i = top.packageQueueCurrent - 1;
            if(i < 0){
                i = top.packageQueue.length - 1;
            }
            return top.packageQueue[i];
        }
    }

    function getNextStream(){
        if(top.packageQueue.length > 1){
            var i = top.packageQueueCurrent + 1;
            if(i >= top.packageQueue.length){
                i = 0;
            }
            return top.packageQueue[i];
        }
    }

    function help(){
        getManifest(function (data){
            gui.Shell.openExternal('https://megacubo.tv/online/2018/?version='+data.version);
        })
    }

    var minigetProvider, m3u8Parser;
    
    function miniget(){
        if(!top.minigetProvider){
            top.minigetProvider = require('miniget');
        }
        return top.minigetProvider.apply(window, arguments);
    }
    
    function getM3u8Parser(){
        if(!top.m3u8Parser){
            top.m3u8Parser = require('m3u8-parser');
        }
        return new top.m3u8Parser.Parser();
    }    

    function areFramesReady(callback){
        var ok = true;
        ['player', 'overlay', 'controls'].forEach((name) => {
            var w = getFrame(name);
            if(!w || !w.document || ['loaded', 'complete'].indexOf(w.document.readyState)==-1){
                ok = false;
            } else {
                if(!w.top){
                    w.top = window.top;
                }
            }
        })
        if(ok){
            callback()
        } else {
            setTimeout(() => {
                areFramesReady(callback)
            }, 250)
        }
    }

    var shortcuts = [];

    function setupShortcuts(){

        shortcuts.push(createShortcut("Ctrl+Alt+D", () => {
            top.spawnOut()
        }, null, true));
        shortcuts.push(createShortcut("Ctrl+E", () => {
            top.playExternal()
        }, null, true));
        shortcuts.push(createShortcut("Ctrl+W", () => {
            stop()
        }, null, true));
        shortcuts.push(createShortcut("Ctrl+O", () => {
            openFileDialog(function (file){
                playCustomFile(file)
            })
        }, null, true));
        shortcuts.push(createShortcut("F1 Ctrl+I", help));
        shortcuts.push(createShortcut("F2", () => {
            var c = getFrame('controls');
            if(c){
                c.renameSelectedEntry()
            }
        }, null, true))
        shortcuts.push(createShortcut("F3 Ctrl+F", () => {
            var c = getFrame('controls');
            c.showControls();
            c.listEntriesByPath(Lang.SEARCH);
            setTimeout(() => {
                c.refreshListing();
                jQuery(c.document).find('.entry input').parent().get(0).focus()
            }, 150)
        }, null, true));
        shortcuts.push(createShortcut("F5", () => {
            getFrame('controls').autoCleanEntries()
        }, null, true));
        shortcuts.push(createShortcut("Space", () => {
            top.playPause()
        }));
        shortcuts.push(createShortcut("Ctrl+H", () => {
            getFrame('controls').goHistory()
        }, null, true));
        shortcuts.push(createShortcut("Ctrl+D", () => {
            getFrame('controls').addFav()
        }, null, true));
        shortcuts.push(createShortcut("Ctrl+Shift+D", () => {
            getFrame('controls').removeFav()
        }, null, true));
        shortcuts.push(createShortcut("Ctrl+Alt+R", () => {
            top.location.reload()
        }, null, true));
        shortcuts.push(createShortcut("Home", () => {
            if(!areControlsActive()){
                showControls()
            }
            getFrame('controls').listEntriesByPath('')
        }));
        shortcuts.push(createShortcut("Ctrl+Home", () => { // with Ctrl it work on inputs so
            if(!areControlsActive()){
                showControls()
            }
            getFrame('controls').listEntriesByPath('')
        }, null, true));
        shortcuts.push(createShortcut("Delete", () => {
            if(areControlsActive()){
                var c = getFrame('controls');
                c.triggerEntryAction('delete')
            } else {
                if(!areControlsHiding()){
                    stop();
                    notify(Lang.STOP, 'fa-stop', 'short')
                }
            }
        }));
        shortcuts.push(createShortcut("Up", () => {
            showControls();
            var c = getFrame('controls');
            c.focusPrevious()
        }, "hold", true));
        shortcuts.push(createShortcut("Down", () => {
            showControls();
            var c = getFrame('controls');
            c.focusNext()
        }, "hold", true));
        shortcuts.push(createShortcut("Right Enter", () => {
            if(areControlsActive()){
                var c = getFrame('controls');
                c.triggerEnter()
            } else {
                showControls()
            }
        }));
        shortcuts.push(createShortcut("Left Backspace", () => {
            if(areControlsActive()){
                var c = getFrame('controls');
                c.triggerBack()
            } else {
                seekRewind()
            }
        }, "hold"));
        shortcuts.push(createShortcut("Ctrl+Backspace", () => { // with Ctrl it work on inputs so
            if(areControlsActive()){
                var c = getFrame('controls');
                c.triggerBack()
            } else {
                seekRewind()
            }
        }, null, true));
        shortcuts.push(createShortcut("Shift+Left", () => {
            seekRewind()
        }, "hold", true));
        shortcuts.push(createShortcut("Shift+Right", () => {
            seekForward()
        }, "hold", true));
        shortcuts.push(createShortcut("Esc", () => {
            top.escapePressed()
        }, null, true));
        jQuery.Shortcuts.start();

        if(!top || top == window){
            var globalHotkeys = [
                {
                    key : "Ctrl+M",
                    active : () => {
                        top.toggleMiniPlayer()
                    }
                },
                {
                    key : "Ctrl+U",
                    active : () => {
                        var c = getFrame('controls');
                        if(c){
                            c.addNewSource()
                        }
                    }
                },
                {
                    key : "Alt+Enter",
                    active : () => {
                        top.toggleFullScreen()
                    }
                },
                {
                    key : "F4",
                    active : () => {
                        changeScaleMode()
                    }
                },
                {
                    key : "F9",
                    active : () => {
                        if(!top.isRecording){
                            top.startRecording()
                        } else {
                            top.stopRecording()
                        }
                    }
                },
                {
                    key : "F11",
                    active : () => {
                        top.toggleFullScreen()
                    }
                },
                {
                    key : "Ctrl+Left",
                    active : () => {
                        var s = getPreviousStream();
                        if(s){
                            console.log(s);
                            getFrame('controls').playEntry(s)
                        }
                    }
                },
                {
                    key : "Ctrl+Right",
                    active : () => {
                        var s = getNextStream();
                        if(s){
                            console.log(s);
                            getFrame('controls').playEntry(s)
                        }
                    }
                },
                {
                    key : "MediaPrevTrack",
                    active : () => {
                        var s = getPreviousStream();
                        if(s){
                            console.log(s);
                            getFrame('controls').playEntry(s)
                        }
                    }
                },
                {
                    key : "MediaNextTrack",
                    active : () => {
                        var s = getNextStream();
                        if(s){
                            console.log(s);
                            getFrame('controls').playEntry(s)
                        }
                    }
                },
                {
                    key : "MediaPlayPause",
                    active : () => {
                        top.playPause();
                    }
                },
                {
                    key : "MediaStop",
                    active : () => {
                        top.playPause(false);
                    }
                }
            ];
            for(var i=0; i<globalHotkeys.length; i++){
                console.log('Registering hotkey: '+globalHotkeys[i].key);
                globalHotkeys[i].failed = function(msg) {
                    // :(, fail to register the |key| or couldn't parse the |key|.
                    console.log(msg)
                }
                globalHotkeys[i] = new gui.Shortcut(globalHotkeys[i]);
                gui.App.registerGlobalHotKey(globalHotkeys[i]);
            }
            jQuery(window).on('beforeunload', () => {
                for(var i=0; i<globalHotkeys.length; i++){
                    nw.App.unregisterGlobalHotKey(globalHotkeys[i]);
                }
                console.log('Hotkeys unregistered.')
            })
        }
    }
    
    var b = jQuery(top.document).find('body');
    
    var areControlsActive = () => {
        return b.hasClass('istyping') || b.hasClass('isovercontrols');
    }
    
    var areControlsHiding = () => {
        return top.controlsHiding || false;
    }
    
    function showControls(){
        if(!areControlsActive()){
            b.addClass('isovercontrols');
            console.log('CC')
        } else {
            console.log('DD')
        }
    }
    
    function hideControls(){
        //console.log('EE', traceback())

        if(!top || !top.PlaybackManager){
            return;
        }
        
        if(!isPlaying() && (top.PlaybackManager.activeIntent.type!='frame' || top.PlaybackManager.activeIntent.videoElement)){
            //console.log('FF')
            return showControls();
        }
        //console.log('GG')
        if(areControlsActive()){
            //console.log('HH')
            top.controlsHiding = true;
            var c = getFrame('controls');
            b.removeClass('istyping isovercontrols');
            var controlsActiveElement = c.document.activeElement;
            //console.log('HIDE', controlsActiveElement)
            if(controlsActiveElement && controlsActiveElement.tagName.toLowerCase()=='input'){
                //console.log('HIDE UNFOCUS', controlsActiveElement)
                c.focusPrevious()
            }
            setTimeout(() => {
                top.controlsHiding = false;
            }, 600)
        }
    }
    
    function wait(checker, callback){
        var r = checker();
        if(r){
            callback(r)
        } else {
            setTimeout(() => {
                wait(checker, callback)
            }, 250);
        }
    }
    
    function getDomain(u){
        if(u.indexOf('//')!=-1){
            var domain = u.split('//')[1].split('/')[0];
            if(domain.indexOf('.')!=-1){
                return domain;
            }
        }
        return '';
    }
    
    function getProto(u){
        var pos = u.indexOf('://');
        if(pos != -1){
            var proto = u.substr(0, pos).toLowerCase();
            return proto;
        }
        return false;
    }
    
    function extractURLs(val){
        var urls = [], lines = val.split("\n");
        for(var i=0; i<lines.length; i++){
            if(lines[i].match(new RegExp('^(//|https?:)'))){
                urls.push(lines[i]);
            }
        }
        return urls;
    }

    function dateStamp(){
        var d = new Date();
        return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0" + d.getDate()).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + "-" + ("0" + d.getMinutes()).slice(-2);
    }

    function nl2br (str) {
        var breakTag = '<br />';
        return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2');
    }

    function fixUTF8(str) {
        return str
        // U+20AC  0x80  € â‚¬   %E2 %82 %AC
        .replace(/â‚¬/g, '€')
        // U+201A  0x82  ‚ â€š   %E2 %80 %9A
        .replace(/â€š/g, '‚')
        // U+0192  0x83  ƒ Æ’  %C6 %92
        .replace(/Æ’/g, 'ƒ')
        // U+201E  0x84  „ â€ž   %E2 %80 %9E
        .replace(/â€ž/g, '„')
        // U+2026  0x85  … â€¦   %E2 %80 %A6
        .replace(/â€¦/g, '…')
        // U+2020  0x86  † â€  %E2 %80 %A0
        .replace(/â€\u00A0/g, '†')
        // U+2021  0x87  ‡ â€¡   %E2 %80 %A1
        .replace(/â€¡/g, '‡')
        // U+02C6  0x88  ˆ Ë†  %CB %86
        .replace(/Ë†/g, 'ˆ')
        // U+2030  0x89  ‰ â€°   %E2 %80 %B0
        .replace(/â€°/g, '‰')
        // U+0160  0x8A  Š Å   %C5 %A0
        .replace(/Å\u00A0/g, 'Š')
        // U+2039  0x8B  ‹ â€¹   %E2 %80 %B9
        .replace(/â€¹/g, '‹')
        // U+0152  0x8C  Œ Å’  %C5 %92
        .replace(/Å’/g, 'Œ')
        // U+017D  0x8E  Ž Å½  %C5 %BD
        .replace(/Å½/g, 'Ž')
        // U+2018  0x91  ‘ â€˜   %E2 %80 %98
        .replace(/â€˜/g, '‘')
        // U+2019  0x92  ’ â€™   %E2 %80 %99
        .replace(/â€™/g, '’')
        // U+201C  0x93  “ â€œ   %E2 %80 %9C
        .replace(/â€œ/g, '“')
        // U+201D  0x94  ” â€  %E2 %80 %9D
        .replace(/â€\u009D/g, '”')
        // U+2022  0x95  • â€¢   %E2 %80 %A2
        .replace(/â€¢/g, '•')
        // U+2013  0x96  – â€“   %E2 %80 %93
        .replace(/â€“/g, '–')
        // U+2014  0x97  — â€”   %E2 %80 %94
        .replace(/â€”/g, '—')
        // U+02DC  0x98  ˜ Ëœ  %CB %9C
        .replace(/Ëœ/g, '˜')
        // U+2122  0x99  ™ â„¢   %E2 %84 %A2
        .replace(/â„¢/g, '™')
        // U+0161  0x9A  š Å¡  %C5 %A1
        .replace(/Å¡/g, 'š')
        // U+203A  0x9B  › â€º   %E2 %80 %BA
        .replace(/â€º/g, '›')
        // U+0153  0x9C  œ Å“  %C5 %93
        .replace(/Å“/g, 'œ')
        // U+017E  0x9E  ž Å¾  %C5 %BE
        .replace(/Å¾/g, 'ž')
        // U+0178  0x9F  Ÿ Å¸  %C5 %B8
        .replace(/Å¸/g, 'Ÿ')
        // U+00A0  0xA0    Â   %C2 %A0
        .replace(/Â /g, ' ')
        // U+00A1  0xA1  ¡ Â¡  %C2 %A1
        .replace(/Â¡/g, '¡')
        // U+00A2  0xA2  ¢ Â¢  %C2 %A2
        .replace(/Â¢/g, '¢')
        // U+00A3  0xA3  £ Â£  %C2 %A3
        .replace(/Â£/g, '£')
        // U+00A4  0xA4  ¤ Â¤  %C2 %A4
        .replace(/Â¤/g, '¤')
        // U+00A5  0xA5  ¥ Â¥  %C2 %A5
        .replace(/Â¥/g, '¥')
        // U+00A6  0xA6  ¦ Â¦  %C2 %A6
        .replace(/Â¦/g, '¦')
        // U+00A7  0xA7  § Â§  %C2 %A7
        .replace(/Â§/g, '§')
        // U+00A8  0xA8  ¨ Â¨  %C2 %A8
        .replace(/Â¨/g, '¨')
        // U+00A9  0xA9  © Â©  %C2 %A9
        .replace(/Â©/g, '©')
        // U+00AA  0xAA  ª Âª  %C2 %AA
        .replace(/Âª/g, 'ª')
        // U+00AB  0xAB  « Â«  %C2 %AB
        .replace(/Â«/g, '«')
        // U+00AC  0xAC  ¬ Â¬  %C2 %AC
        .replace(/Â¬/g, '¬')
        // U+00AD  0xAD  ­ Â­  %C2 %AD
        .replace(/Â­/g, '­')
        // U+00AE  0xAE  ® Â®  %C2 %AE
        .replace(/Â®/g, '®')
        // U+00AF  0xAF  ¯ Â¯  %C2 %AF
        .replace(/Â¯/g, '¯')
        // U+00B0  0xB0  ° Â°  %C2 %B0
        .replace(/Â°/g, '°')
        // U+00B1  0xB1  ± Â±  %C2 %B1
        .replace(/Â±/g, '±')
        // U+00B2  0xB2  ² Â²  %C2 %B2
        .replace(/Â²/g, '²')
        // U+00B3  0xB3  ³ Â³  %C2 %B3
        .replace(/Â³/g, '³')
        // U+00B4  0xB4  ´ Â´  %C2 %B4
        .replace(/Â´/g, '´')
        // U+00B5  0xB5  µ Âµ  %C2 %B5
        .replace(/Âµ/g, 'µ')
        // U+00B6  0xB6  ¶ Â¶  %C2 %B6
        .replace(/Â¶/g, '¶')
        // U+00B7  0xB7  · Â·  %C2 %B7
        .replace(/Â·/g, '·')
        // U+00B8  0xB8  ¸ Â¸  %C2 %B8
        .replace(/Â¸/g, '¸')
        // U+00B9  0xB9  ¹ Â¹  %C2 %B9
        .replace(/Â¹/g, '¹')
        // U+00BA  0xBA  º Âº  %C2 %BA
        .replace(/Âº/g, 'º')
        // U+00BB  0xBB  » Â»  %C2 %BB
        .replace(/Â»/g, '»')
        // U+00BC  0xBC  ¼ Â¼  %C2 %BC
        .replace(/Â¼/g, '¼')
        // U+00BD  0xBD  ½ Â½  %C2 %BD
        .replace(/Â½/g, '½')
        // U+00BE  0xBE  ¾ Â¾  %C2 %BE
        .replace(/Â¾/g, '¾')
        // U+00BF  0xBF  ¿ Â¿  %C2 %BF
        .replace(/Â¿/g, '¿')
        // U+00C0  0xC0  À Ã€  %C3 %80
        .replace(/Ã€/g, 'À')
        // U+00C2  0xC2  Â Ã‚  %C3 %82
        .replace(/Ã‚/g, 'Â')
        // U+00C3  0xC3  Ã Ãƒ  %C3 %83
        .replace(/Ãƒ/g, 'Ã')
        // U+00C4  0xC4  Ä Ã„  %C3 %84
        .replace(/Ã„/g, 'Ä')
        // U+00C5  0xC5  Å Ã…  %C3 %85
        .replace(/Ã…/g, 'Å')
        // U+00C6  0xC6  Æ Ã†  %C3 %86
        .replace(/Ã†/g, 'Æ')
        // U+00C7  0xC7  Ç Ã‡  %C3 %87
        .replace(/Ã‡/g, 'Ç')
        // U+00C8  0xC8  È Ãˆ  %C3 %88
        .replace(/Ãˆ/g, 'È')
        // U+00C9  0xC9  É Ã‰  %C3 %89
        .replace(/Ã‰/g, 'É')
        // U+00CA  0xCA  Ê ÃŠ  %C3 %8A
        .replace(/ÃŠ/g, 'Ê')
        // U+00CB  0xCB  Ë Ã‹  %C3 %8B
        .replace(/Ã‹/g, 'Ë')
        // U+00CC  0xCC  Ì ÃŒ  %C3 %8C
        .replace(/ÃŒ/g, 'Ì')
        // U+00CD  0xCD  Í Ã   %C3 %8D
        .replace(/Ã\u008D/g, 'Í')
        // U+00CE  0xCE  Î ÃŽ  %C3 %8E
        .replace(/ÃŽ/g, 'Î')
        // U+00CF  0xCF  Ï Ã   %C3 %8F
        .replace(/Ã\u008F/g, 'Ï')
        // U+00D0  0xD0  Ð Ã   %C3 %90
        .replace(/Ã\u0090/g, 'Ð')
        // U+00D1  0xD1  Ñ Ã‘  %C3 %91
        .replace(/Ã‘/g, 'Ñ')
        // U+00D2  0xD2  Ò Ã’  %C3 %92
        .replace(/Ã’/g, 'Ò')
        // U+00D3  0xD3  Ó Ã“  %C3 %93
        .replace(/Ã“/g, 'Ó')
        // U+00D4  0xD4  Ô Ã”  %C3 %94
        .replace(/Ã”/g, 'Ô')
        // U+00D5  0xD5  Õ Ã•  %C3 %95
        .replace(/Ã•/g, 'Õ')
        // U+00D6  0xD6  Ö Ã–  %C3 %96
        .replace(/Ã–/g, 'Ö')
        // U+00D7  0xD7  × Ã—  %C3 %97
        .replace(/Ã—/g, '×')
        // U+00D8  0xD8  Ø Ã˜  %C3 %98
        .replace(/Ã˜/g, 'Ø')
        // U+00D9  0xD9  Ù Ã™  %C3 %99
        .replace(/Ã™/g, 'Ù')
        // U+00DA  0xDA  Ú Ãš  %C3 %9A
        .replace(/Ãš/g, 'Ú')
        // U+00DB  0xDB  Û Ã›  %C3 %9B
        .replace(/Ã›/g, 'Û')
        // U+00DC  0xDC  Ü Ãœ  %C3 %9C
        .replace(/Ãœ/g, 'Ü')
        // U+00DD  0xDD  Ý Ã   %C3 %9D
        .replace(/Ã\u009D/g, 'Ý')
        // U+00DE  0xDE  Þ Ãž  %C3 %9E
        .replace(/Ãž/g, 'Þ')
        // U+00DF  0xDF  ß ÃŸ  %C3 %9F
        .replace(/ÃŸ/g, 'ß')
        // U+00E0  0xE0  à Ã   %C3 %A0
        .replace(/Ã\u00A0/g, 'à')
        // U+00E1  0xE1  á Ã¡  %C3 %A1
        .replace(/Ã¡/g, 'á')
        // U+00E2  0xE2  â Ã¢  %C3 %A2
        .replace(/Ã¢/g, 'â')
        // U+00E3  0xE3  ã Ã£  %C3 %A3
        .replace(/Ã£/g, 'ã')
        // U+00E4  0xE4  ä Ã¤  %C3 %A4
        .replace(/Ã¤/g, 'ä')
        // U+00E5  0xE5  å Ã¥  %C3 %A5
        .replace(/Ã¥/g, 'å')
        // U+00E6  0xE6  æ Ã¦  %C3 %A6
        .replace(/Ã¦/g, 'æ')
        // U+00E7  0xE7  ç Ã§  %C3 %A7
        .replace(/Ã§/g, 'ç')
        // U+00E8  0xE8  è Ã¨  %C3 %A8
        .replace(/Ã¨/g, 'è')
        // U+00E9  0xE9  é Ã©  %C3 %A9
        .replace(/Ã©/g, 'é')
        // U+00EA  0xEA  ê Ãª  %C3 %AA
        .replace(/Ãª/g, 'ê')
        // U+00EB  0xEB  ë Ã«  %C3 %AB
        .replace(/Ã«/g, 'ë')
        // U+00EC  0xEC  ì Ã¬  %C3 %AC
        .replace(/Ã¬/g, 'ì')
        // U+00ED  0xED  í Ã­  %C3 %AD
        .replace(/Ã\u00AD/g, 'í')
        // U+00EE  0xEE  î Ã®  %C3 %AE
        .replace(/Ã®/g, 'î')
        // U+00EF  0xEF  ï Ã¯  %C3 %AF
        .replace(/Ã¯/g, 'ï')
        // U+00F0  0xF0  ð Ã°  %C3 %B0
        .replace(/Ã°/g, 'ð')
        // U+00F1  0xF1  ñ Ã±  %C3 %B1
        .replace(/Ã±/g, 'ñ')
        // U+00F2  0xF2  ò Ã²  %C3 %B2
        .replace(/Ã²/g, 'ò')
        // U+00F3  0xF3  ó Ã³  %C3 %B3
        .replace(/Ã³/g, 'ó')
        // U+00F4  0xF4  ô Ã´  %C3 %B4
        .replace(/Ã´/g, 'ô')
        // U+00F5  0xF5  õ Ãµ  %C3 %B5
        .replace(/Ãµ/g, 'õ')
        // U+00F6  0xF6  ö Ã¶  %C3 %B6
        .replace(/Ã¶/g, 'ö')
        // U+00F7  0xF7  ÷ Ã·  %C3 %B7
        .replace(/Ã·/g, '÷')
        // U+00F8  0xF8  ø Ã¸  %C3 %B8
        .replace(/Ã¸/g, 'ø')
        // U+00F9  0xF9  ù Ã¹  %C3 %B9
        .replace(/Ã¹/g, 'ù')
        // U+00FA  0xFA  ú Ãº  %C3 %BA
        .replace(/Ãº/g, 'ú')
        // U+00FB  0xFB  û Ã»  %C3 %BB
        .replace(/Ã»/g, 'û')
        // U+00FC  0xFC  ü Ã¼  %C3 %BC
        .replace(/Ã¼/g, 'ü')
        // U+00FD  0xFD  ý Ã½  %C3 %BD
        .replace(/Ã½/g, 'ý')
        // U+00FE  0xFE  þ Ã¾  %C3 %BE
        .replace(/Ã¾/g, 'þ')
        // U+00FF  0xFF  ÿ Ã¿  %C3 %BF
        .replace(/Ã¿/g, 'ÿ')
    }
    
    function askForSource(question, callback, placeholder, showCommunityListOption){
        if(top){
            if(top.miniPlayerActive){
                top.leaveMiniPlayer()
            }
            var defaultValue = Store.get('last-ask-for-source-value');
            var cb = top.clipboard.get('text');
            if(cb.match(new RegExp('^(//|https?://)'))){
                defaultValue = cb;
            }
            var options = [
                ['<i class="fa fa-search" aria-hidden="true"></i> '+Lang.FIND_LISTS, () => {
                    nw.Shell.openExternal(getIPTVListSearchURL());
                }],
                ['<i class="fa fa-check-circle" aria-hidden="true"></i> OK', () => {
                    // parse lines for names and urls and use registerSource(url, name) for each
                    var v = top.modalPromptVal();
                    if(v){
                        if(v.substr(0, 2)=='//'){
                            v = 'http:'+v;
                        }
                        Store.set('last-ask-for-source-value', v);
                    }
                    if(callback(v)){
                        top.modalClose()
                    }
                }]
            ];
            if(showCommunityListOption){
                options.splice(1, 0, [
                    '<i class="fa fa-users" aria-hidden="true"></i> '+Lang.USE_COMMUNITY_LIST, () => {
                        addCommunityList()
                    }
                ])
            }
            top.modalPrompt(question, options, Lang.PASTE_URL_HINT, defaultValue)
        }
    }
    
    function addCommunityList(){
        if(top){
            var options = [
                ['<i class="fa fa-undo" aria-hidden="true"></i> '+Lang.BACK, () => {
                    var c = getFrame('controls');
                    if(c){
                        c.getIPTVListContent(() => {
                            top.modalClose()
                        })
                    }
                }],
                ['<i class="fa fa-check-circle" aria-hidden="true"></i> '+Lang.I_AGREE, () => {
                    registerSource('http://app.megacubo.net/auto', Lang.COMMUNITY_LIST); // an endpoint which always redirects to the most used list URL in that country dynamically
                    top.modalClose()
                }]
            ];
            top.modalConfirm(Lang.ASK_COMMUNITY_LIST.format(Lang.I_AGREE), options)
        }
    }

    function isValidPath(url){ // poor checking for now
        if(url.indexOf('/') == -1 && url.indexOf('\\') == -1){
            return false;
        }
        return true;
    }
        
    function playCustomURL(placeholder, direct){
        var url;
        if(placeholder && direct){
            url = placeholder;
        } else {
            if(!placeholder) placeholder = Store.get('lastCustomPlayURL');
            return top.askForSource(Lang.PASTE_URL_HINT, function (val){
                playCustomURL(val+'#nosandbox', true);
                return true;
            })            
        }
        if(url){
            if(url.substr(0, 2)=='//'){
                url = 'http:'+url;
            }
            Store.set('lastCustomPlayURL', url);
            var name = false;
            if(isMagnet(url)){
                name = true;
                var match = url.match(new RegExp('dn=([^&]+)'));
                if(match){
                    name = decodeURIComponent(match[1])
                } else {
                    name = 'Magnet URL';
                }
            } else if(isValidPath(url)){
                name = 'Megacubo '+url.split('/')[2];
            }
            if(name){
                console.log('lastCustomPlayURL', url, name);
                Store.set('lastCustomPlayURL', url);
                top.createPlayIntent({url: url+'#nosandbox', name: name}, {manual: true})
            }
        }
    }
    
    function playCustomFile(file){
        Store.set('lastCustomPlayFile', file);
        top.createPlayIntent({url: file, name: basename(file, true)}, {manual: true})
    }

    function checkPermission(file, mask, cb){ // https://stackoverflow.com/questions/11775884/nodejs-file-permissions
        fs.stat(file, function (error, stats){
            if (error){
                cb (error, false);
            } else {
                var v = false;
                try {
                    v = !!(mask & parseInt ((stats.mode & parseInt ("777", 8)).toString (8)[0]));
                } catch(e) {
                    console.error(e)
                }
                cb (null, v)
            }
        })
    }

    function isWritable(path, cb){
        checkPermission(path, 2, cb);
    }

    function filesize(filename) {
        const stats = fs.statSync(filename);
        const fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }

    function copyFile(source, target, cb) {
        var cbCalled = false;
        var done = function (err) {
            if (!cbCalled) {
                cb(err);
                cbCalled = true;
            }
        }
        var rd = fs.createReadStream(source);
        rd.on("error", function(err) {
            done(err);
        });
        var wr = fs.createWriteStream(target);
        wr.on("error", function(err) {
            done(err);
        });
        wr.on("close", function(ex) {
            done();
        });
        rd.pipe(wr)
    }

    function createShortcut(key, callback, type, enableInInput){
        key = key.replaceAll(' ', ',');
        jQuery.Shortcuts.add({
            type: type ? type : 'down',
            mask: key,
            enableInInput: !!enableInInput,
            handler: () => {
                console.log(key+' pressed', document.URL)
                callback()
            }
        })
    }

    jQuery(setupShortcuts);    

    function stop(skipPlaybackManager){
        console.log('STOP', traceback());
        if(!skipPlaybackManager){
            top.PlaybackManager.stop();
        }
        showPlayers(false, false);
        setTitleData('Megacubo', 'default_icon.png');
        setTimeout(() => {
            if(!isPlaying()){
                var c = getFrame('controls');
                if(c){
                    c.showControls();
                    c.refreshListingIfMatch(Lang.OPTIONS)
                }
            }
        }, 400)
    }
    
    function currentStream(){
        var ret = false;
        try {
            ret = top.PlaybackManager.activeIntent.entry;
        } catch(e) {

        }
        return ret;
    }
    
    function isSandboxLoading(){
        var c = getFrame('controls');
        var stream = c.currentSandboxStreamArgs;
        console.log('isSandboxLoading', c.currentSandboxTimeoutTimer, top.document.querySelector('iframe#sandbox').src, stream);
        return c.currentSandboxTimeoutTimer && (top.document.querySelector('iframe#sandbox').src == stream[0].url);
    }
    
    function getManifest(callback){
        jQuery.get('/package.json', function (data){
            data = data.replace(new RegExp('/\\* .+ \\*/', 'gm'), '');
            data = JSON.parse(data);
            console.log(data);
            callback(data)
        })
    }
        
    function spawnOut(options, callback){
        getManifest(function (data){
            if(typeof(data)=='object'){
                data = data.window;
                var disallow = 'avoidthisparameter'.split('|');
                for(var k in data){
                    if(disallow.indexOf(k)!=-1){
                        delete data[k];
                    }
                }
                console.log(data);
            }
            nw.Window.open('/index.html', data, function (popWin){
                if(callback){
                    callback(popWin);
                }
            })
            stop()
        })
    }

    function time(){
        return ((new Date()).getTime()/1000);
    }

    function checkImage(url, load, error){
        if(typeof(window._testImageObject)=='undefined'){
            _testImageObject = new Image();
        }
        _testImageObject.onerror = error;
        _testImageObject.onload = load;
        _testImageObject.src = url;
        return _testImageObject;
    }

    function applyIcon(icon){
        if(top){
            var doc = top.document;
            var link = doc.querySelector("link[rel*='icon']") || doc.createElement('link');
            link.type = 'image/x-png';
            link.rel = 'shortcut icon';
            link.href = icon;
            doc.getElementsByTagName('head')[0].appendChild(link);
            var c = doc.querySelector('.nw-cf-icon');
            if(c){
                c.style.backgroundImage = 'url("{0}")'.format(icon)
            }
        }
    }

    var notifyTimer = 0;
    function notifyParseTime(secs){
        var maxSecs = 200000;
        switch(secs){
            case 'short':
                secs = 1;
                break;
            case 'normal':
                secs = 4;
                break;
            case 'long':
                secs = 7;
                break;
            case 'wait':
                secs = 120;
                break;
            case 'forever':
                secs = 30 * (24 * 3600);
                break;
        }
        if(secs > maxSecs){
            secs = maxSecs;
        }
        return secs;
    }

    function notify(str, fa, secs){
        var o = getFrame('overlay'), a = jQuery(o.document.getElementById('notify-area'));
        if(!str) {
            a.find('.notify-wait').remove();
            return;
        }
        var c = '', timer;
        if(o){
            if(secs == 'wait'){
                c += ' notify-wait';
            }
            secs = notifyParseTime(secs);
            var destroy = () => {
                n.hide(400, () => {
                    jQuery(this).remove()
                })
            };
            a.find('.notify-row').filter((i, o) => {
                return jQuery(o).find('div').text().trim() == str;
            }).add(a.find('.notify-wait')).remove();
            if(fa) fa = '<i class="fa {0}" aria-hidden="true"></i> '.format(fa);
            var n = jQuery('<div class="notify-row '+c+'"><div class="notify">' + fa + ' ' + str + '</div></div>');
            n.prependTo(a);
            timer = top.setTimeout(destroy, secs * 1000);
            return {
                update: (str, fa, secs) => {
                    if(fa && str) {
                        fa = '<i class="fa {0}" aria-hidden="true"></i> '.format(fa);
                        n.find('.notify').html(fa + ' ' + str)
                    }
                    if(secs){
                        secs = notifyParseTime(secs);
                        clearTimeout(timer);
                        timer = top.setTimeout(destroy, secs * 1000);
                    }
                },
                close: () => {
                    clearTimeout(timer);
                    destroy()
                }
            }
        }
    }


    var pendingStateTimer = 0, defaultTitle = '';

    function enterPendingState(title) {
        setTitleFlag('fa-circle-o-notch fa-spin', title);
        notify(Lang.LOADING, 'fa-circle-o-notch fa-spin', 'short');
    }
    
    function leavePendingState() {
        setTitleFlag('', defaultTitle);
        getFrame('controls').removeLoadingFlags()
    }

    function setTitleData(title, icon) {
        console.log('TITLE = '+title);
        defaultTitle = title;
        if(top){
            var defaultIcon= 'default_icon.png';
            applyIcon(icon);
            checkImage(icon, () => {}, () => {
                applyIcon(defaultIcon);
            });
            var doc = top.document;
            doc.title = title;
            var c = doc.querySelector('.nw-cf-title');
            if(c){
                c.innerText = title;
            }
            console.log('TITLE OK');
        }
    }

    function setTitleFlag(fa, title){
        var t = top.document.querySelector('.nw-cf-icon');
        if(t){
            if(fa){ // fa-circle-o-notch fa-spin
                t.style.backgroundPositionX = '50px';
                t.innerHTML = '<i class="fa {0}" aria-hidden="true"></i>'.format(fa);
            } else {
                t.style.backgroundPositionX = '0px';
                t.innerHTML = '';
            }
            if(typeof(title)=='string'){
                var doc = top.document;
                doc.title = title;
                var c = doc.querySelector('.nw-cf-title');
                if(c){
                    if(!defaultTitle){
                        defaultTitle = c.innerText;
                    }
                    c.innerText = title;
                }
            }
        }
    }
    
    function fetchTimeout(url, callback, ms, opts){
        let didTimeOut = false;
        return new Promise(function (resolve, reject) {
            const timeout = setTimeout(function() {
                didTimeOut = true;
                reject(new Error('Request timed out'));
            }, ms);
            fetch(url, opts).then((response) => {
                return response.text()
            }).then((response) => {
                // Clear the timeout as cleanup
                clearTimeout(timeout);
                if(!didTimeOut) {
                    resolve(response);
                    callback(response)
                }
            })
            .catch(function(err) {
                console.log('fetch failed! ', err);
                if(didTimeOut) return;
                reject(err);
                callback(false)
            });
        }).catch(function(err) {
            // Error: response error, request timeout or runtime error
            console.log('promise error! ', err);
            callback(false)
        })
    }

    function hasValidTitle(){
        var title = top.document.title;
        var stream = currentStream();
        var streamTitle = stream ? stream.name : '';
        return (title && title == streamTitle && title.indexOf('Megacubo')==-1);
    }

    function ltrimPathBar(path){
        if(path && path.charAt(0)=='/'){
            path = path.substr(1)
        }
        return path || '';
    }

    function removeQueryString(url){
        return url.split('?')[0].split('#')[0];
    }

    function basename(str, rqs){
        _str = new String(str); 
        pos = _str.replaceAll('\\', '/').lastIndexOf('/');
        if(pos != -1){
            _str = _str.substring(pos + 1); 
        }
        if(rqs){
            _str = removeQueryString(_str);
        }
        return _str;
    }
    
    function dirname(str){
        _str = new String(str); 
        pos = _str.replaceAll('\\', '/').lastIndexOf('/');
        if(!pos) return '';
        _str = _str.substring(0, pos); 
        return _str;
    }
    
    function stripRootFolderFromStr(str){
        if(str.charAt(0)=='/') str = str.substr(1);
        var root = getRootFolderFromStr(str);
        str = str.substring(root.length + 1); 
        return str;
    }
    
    function getRootFolderFromStr(str){
        _str = new String(str).replaceAll('\\', '/'); 
        if(_str.charAt(0)=='/') _str = _str.substr(1);
        pos = _str.indexOf('/');
        if(pos == -1) return _str;
        _str = _str.substring(0, pos); 
        return _str;
    }
    
    function isM3U8(url){
        if(typeof(url)!='string') return false;
        return ['m3u8', 'm3u'].indexOf(getExt(url)) != -1;            
    }
    
    function isRTMP(url){
        if(typeof(url)!='string') return false;
        return url.match(new RegExp('^rtmp[a-z]?:', 'i'));            
    }
    
    function isMagnet(url){
        if(typeof(url)!='string') return false;
        return url.substr(0, 7)=='magnet:';            
    }
    
    function isRTSP(url){
        if(typeof(url)!='string') return false;
        return url.match(new RegExp('(^(rtsp|mms)[a-z]?:|\:[0-9]+\/)', 'i'));            
    }
    
    function isLocal(url){
        if(typeof(url)!='string') return false;
        return url.substr(0, 5)=='file:';
    }
    
    function isVideo(url){
        if(typeof(url)!='string') return false;
        return url.match(new RegExp('\\.(wm[av]|avi|mp[34]|mk[av]|m4[av]|mov|flv|webm|flac|aac|ogg|ts)', 'i'));            
    }
    
    function isHTML5Video(url){
        if(typeof(url)!='string') return false;
        return url.match(new RegExp('\\.(mp[34]|m4[av]|webm|aac|ogg|ts)', 'i'));            
    }
    
    function isLive(url){
        if(typeof(url)!='string') return false;
        return isM3U8(url)||isRTMP(url)||isRTSP(url)||(getExt(url)=='ts');            
    }
    
    function isMedia(url){
        if(typeof(url)!='string') return false;
        return isLive(url)||isLocal(url)||isVideo(url);            
    }
    
    function isPlaying(){
        if(top && top.PlaybackManager){
            return top.PlaybackManager.playing();
        }
    }
    
    function getExt(url){
        return (''+url).split('?')[0].split('#')[0].split('.').pop().toLowerCase();        
    }
    
    function showPlayers(stream, sandbox){
        console.log('showPlayers('+stream+', '+sandbox+')');
        if(top){
            var doc = top.document;
            var pstream = doc.getElementById('player');
            var psandbox = doc.getElementById('sandbox');
            if(sandbox){
                jQuery(psandbox).removeClass('hide').addClass('show');
            } else {
                jQuery(psandbox).removeClass('show').addClass('hide');
            }
            if(stream){
                jQuery(pstream).removeClass('hide').addClass('show');
            } else {
                jQuery(pstream).removeClass('show').addClass('hide');
            }
        }
    }
    
    function isSandboxActive(){
        var doc = top.document;
        return (doc.getElementById('sandbox').className.indexOf('hide')==-1);
    }
    
    function isPlayerActive(){
        var doc = top.document;
        return (doc.getElementById('player').className.indexOf('hide')==-1);
    }

    function getFrame(id){
        if(top && top.document){
            var o = top.document.getElementById(id);
            if(o){
                return o.contentWindow.window;
            }
        }        
    }
    
    function getDefaultLocale(short, noUnderline){
        var lang = window.navigator.languages ? window.navigator.languages[0] : null;
        lang = lang || window.navigator.language || window.navigator.browserLanguage || window.navigator.userLanguage;
        if(!noUnderline){
            lang = lang.replace('-', '_');
        }
        lang = lang.substr(0, short ? 2 : 5);
        return lang;
    }
        
    function getLocale(short, noUnderline){
        var lang = Store.get('overridden-locale');
        if(!lang || typeof(lang)!='string'){
            lang = getDefaultLocale(short, noUnderline);
        }
        if(!noUnderline){
            lang = lang.replace('-', '_');
        }
        lang = lang.substr(0, short ? 2 : 5);
        return lang;
    }
    
    function removeFolder(location, itself, next) {
        console.log(itself?'REMOVING':'CLEANING', location);
        if (!next) next = () => {};
        fs.readdir(location, function(err, files) {
            async.each(files, function(file, cb) {
                file = location + '/' + file;
                fs.stat(file, function(err, stat) {
                    if (err) {
                        return cb(err);
                    }
                    if (stat.isDirectory()) {
                        removeFolder(file, true, cb);
                    }
                    else {
                        fs.unlink(file, function(err) {
                            if (err) {
                                return cb(err);
                            }
                            return cb();
                        })
                    }
                })
            }, function(err) {
                if(itself && !err){
                    fs.rmdir(location, function(err) {
                        return next(err)
                    })
                } else {
                    return next(err)
                }
            })
        })
    }

    if ( typeof window.WPDK_FILTERS === 'undefined' ) {
        
        // List of filters
        window.WPDK_FILTERS = {};
        
        // List of actions
        window.WPDK_ACTIONS = {};
        
        /**
         * Used to add an action or filter. Internal use only.
         *
         * @param {string}   type             Type of hook, 'action' or 'filter'.
         * @param {string}   tag              Name of action or filter.
         * @param {Function} function_to_add  Function hook.
         * @param {integer}  priority         Priority.
         *
         * @since 1.6.1
         */
        window._wpdk_add = function( type, tag, function_to_add, priority )
        {
            var lists = ( 'filter' == type ) ? WPDK_FILTERS : WPDK_ACTIONS;
        
            // Defaults
            priority = ( priority || 10 );
        
            if( !( tag in lists ) ) {
            lists[ tag ] = [];
            }
        
            if( !( priority in lists[ tag ] ) ) {
            lists[ tag ][ priority ] = [];
            }
        
            lists[ tag ][ priority ].push( {
            func : function_to_add,
            pri  : priority
            } );
        
        };
        
        /**
         * Hook a function or method to a specific filter action.
         *
         * WPDK offers filter hooks to allow plugins to modify various types of internal data at runtime in a similar
         * way as php `add_filter()`
         *
         * The following example shows how a callback function is bound to a filter hook.
         * Note that $example is passed to the callback, (maybe) modified, then returned:
         *
         * <code>
         * function example_callback( example ) {
         * 	// Maybe modify $example in some way
         * 	return example;
         * }
         * add_filter( 'example_filter', example_callback );
         * </code>
         *
         * @param {string}   tag             The name of the filter to hook the function_to_add callback to.
         * @param {Function} function_to_add The callback to be run when the filter is applied.
         * @param {integer}  priority        Optional. Used to specify the order in which the functions
         *                                   associated with a particular action are executed. Default 10.
         *                                   Lower numbers correspond with earlier execution,
         *                                   and functions with the same priority are executed
         *                                   in the order in which they were added to the action.
         * @return {boolean}
         */
        window.wpdk_add_filter = function( tag, function_to_add, priority )
        {
            _wpdk_add( 'filter', tag, function_to_add, priority );
        };
        
        /**
         * Hooks a function on to a specific action.
         *
         * Actions are the hooks that the WPDK core launches at specific points during execution, or when specific
         * events occur. Plugins can specify that one or more of its Javascript functions are executed at these points,
         * using the Action API.
         *
         * @since 1.6.1
         *
         * @uses _wpdk_add() Adds an action. Parameter list and functionality are the same.
         *
         * @param {string}   tag             The name of the action to which the $function_to_add is hooked.
         * @param {Function} function_to_add The name of the function you wish to be called.
         * @param {integer}  priority        Optional. Used to specify the order in which the functions associated with a
         *                                   particular action are executed. Default 10.
         *                                   Lower numbers correspond with earlier execution, and functions with the same
         *                                   priority are executed in the order in which they were added to the action.
         *
         * @return bool Will always return true.
         */
        window.wpdk_add_action = function( tag, function_to_add, priority )
        {
            _wpdk_add( 'action', tag, function_to_add, priority );
        };
        
        /**
         * Do an action or apply filters.
         *
         * @param {string} type Type of "do" to do 'action' or 'filter'.
         * @param {Array} args Optional. Original list of arguments. This array could be empty for 'action'.
         * @returns {*}
         */
        window._wpdk_do = function( type, args )
        {
            var hook, lists = ( 'action' == type ) ? WPDK_ACTIONS : WPDK_FILTERS;
            var tag = args[ 0 ];
        
            if( !( tag in lists ) ) {
            return args[ 1 ];
            }
        
            // Remove the first argument
            [].shift.apply( args );
        
            for( var pri in lists[ tag ] ) {
        
            hook = lists[ tag ][ pri ];
        
            if( typeof hook !== 'undefined' ) {
        
                for( var f in hook ) {
                var func = hook[ f ].func;
        
                if( typeof func === "function" ) {
        
                    if( 'filter' === type ) {
                    args[ 0 ] = func.apply( null, args );
                    }
                    else {
                    func.apply( null, args );
                    }
                }
                }
            }
            }
        
            if( 'filter' === type ) {
            return args[ 0 ];
            }
        
        };
        
        /**
         * Call the functions added to a filter hook and the filtered value after all hooked functions are applied to it.
         *
         * The callback functions attached to filter hook $tag are invoked by calling this function. This function can be
         * used to create a new filter hook by simply calling this function with the name of the new hook specified using
         * the tag parameter.
         *
         * The function allows for additional arguments to be added and passed to hooks.
         * <code>
         * // Our filter callback function
         * function example_callback( my_string, arg1, arg2 ) {
         *	// (maybe) modify my_string
        *	return my_string;
        * }
        * wpdk_add_filter( 'example_filter', example_callback, 10 );
        *
        * // Apply the filters by calling the 'example_callback' function we
        * // "hooked" to 'example_filter' using the wpdk_add_filter() function above.
        * // - 'example_filter' is the filter hook tag
        * // - 'filter me' is the value being filtered
        * // - arg1 and arg2 are the additional arguments passed to the callback.
        *
        * var value = wpdk_apply_filters( 'example_filter', 'filter me', arg1, arg2 );
        * </code>
        *
        * @param {string} tag     The name of the filter hook.
        * @param {*}      value   The value on which the filters hooked to <tt>tag</tt> are applied on.
        * @param {...*}   varargs Optional. Additional variables passed to the functions hooked to <tt>tag</tt>.
        *
        * @return {*}
        */
        window.wpdk_apply_filters = function( tag, value, varargs )
        {
            return _wpdk_do( 'filter', arguments );
        };
        
        /**
         * Execute functions hooked on a specific action hook.
         *
         * This function invokes all functions attached to action hook tag. It is possible to create new action hooks by
         * simply calling this function, specifying the name of the new hook using the <tt>tag</tt> parameter.
         *
         * You can pass extra arguments to the hooks, much like you can with wpdk_apply_filters().
         *
         * @since 1.6.1
         *
         * @param {string} tag  The name of the action to be executed.
         * @param {...*}   args Optional. Additional arguments which are passed on to the functions hooked to the action.
         *                      Default empty.
         *
         */
        window.wpdk_do_action = function( tag, args )
        {
            _wpdk_do( 'action', arguments );
        };

        window.addAction = window.wpdk_add_action;
        window.addFilter = window.wpdk_add_filter;
        window.doAction = window.wpdk_do_action;
        window.applyFilters = window.wpdk_apply_filters;

    }
    
    function traceback() { 
        try { 
            var a = {}; 
            a.debug(); 
        } catch(ex) {
            return ex.stack.replace('TypeError: a.debug is not a function', '').trim()
        };
    }
    
    var openFileDialogChooser = false;
    function openFileDialog(callback) {
        if(!openFileDialogChooser){ // JIT
            openFileDialogChooser = jQuery('<input type="file" />');
        }
        openFileDialogChooser.off('change');
        openFileDialogChooser.on('change', function(evt) {
            callback(openFileDialogChooser.val());
        });    
        openFileDialogChooser.trigger('click');  
    }

    var saveFileDialogChooser = false;
    function saveFileDialog(callback, placeholder) {
        if(!saveFileDialogChooser){ // JIT
            saveFileDialogChooser = jQuery('<input type="file" nwsaveas />');
        }
        if(placeholder){
            saveFileDialogChooser.prop('nwsaveas', placeholder)
        }
        saveFileDialogChooser.off('change');
        saveFileDialogChooser.on('change', function(evt) {
            callback(saveFileDialogChooser.val());
        });    
        saveFileDialogChooser.trigger('click')
    }

    //chooseFile(function (file){alert(file);window.ww=file});

    function loadLanguage(locales, callback){
        var localeMask = "lang/{0}.json", locale = locales.shift();
        jQuery.getJSON("lang/"+locale+".json", function( data ) {
            Lang = data;
            if(locale == 'en'){
                callback()
            } else {
                jQuery.getJSON("lang/en.json", function( data ) { // always load EN language as fallback for missing translations
                    Lang = Object.assign(data, Lang);
                    callback()
                })
            }
        }).fail(function (jqXHR, textStatus, errorThrown) {
            if(locales.length){
                loadLanguage(locales, callback)
            } else {
                console.error(jqXHR);
                console.error(textStatus);
                console.error(errorThrown);
            }
        })
    }

    var Lang = {};
    jQuery(() => {
        loadLanguage([getLocale(false), getLocale(true), 'en'], () => {            
            jQuery(() => {
                areFramesReady(() => {
                    jQuery(document).triggerHandler('lngload')
                })
            })
        })
    })
    
    function isYoutubeURL(source){
        if(typeof(source)=='string'){
            var parts = source.split('/');
            if(parts.length > 2){
                if(parts[2].match(new RegExp('youtube\.com|youtu\.be'))){
                    return true;
                }
            }
        }
    }
    
}