
class VideoControl extends EventEmitter {
	constructor(container){
		super()
		this.rootElement = $('html')
		this.container = container
		this.innerContainer = this.container.querySelector('div')
		if(!this.innerContainer){
			this.innerContainer = document.createElement('div')
			this.container.appendChild(this.innerContainer)
		}
		this.adapters = {}
		this.adapter = ''
		this.current = null
		this.state = ''
		this.hasErr = null
		this.clearErrTimer = null
		this.uiVisibility = true
		this.currentAudioTracks = null
		this.currentSubtitleTracks = null
	}
	uiVisible(visible){
		if(this.current){
			this.uiVisibility = visible
			return this.current.uiVisible(visible)
		}
	}
	time(s){
		if(this.current){
			if(typeof(s) == 'number'){
				return this.current.time(s)
			}
			return this.current.time()
		}
		return 0
	}
	duration(){
		if(this.current){
			let r = this.current.duration
			if(isNaN(r)){
				return 0
			}
			if(r === Infinity){
				if(this.current.object.buffered.length){
					for(let i=0; i < this.current.object.buffered.length; i++){
						r = this.current.object.buffered.end(i)
					}
				} else {
					r = this.current.time() + 2
				}
			}
			return r
		}
		return 0
	}
	ratio(s){
		if(this.current){
			if(typeof(s) == 'number'){
				return this.current.ratio(s)
			}
			return this.current.ratio()
		}
		return 0
	}
	playbackRate(rate){
		if(this.current){
			if(typeof(rate) == 'number'){
				return this.current.playbackRate(rate)
			}
			return this.current.playbackRate()
		}
		return 1
	}
	videoRatio(){
		if(this.current){
			return this.current.videoRatio()
		}
		return 0
	}
	show(){
		const useCurtains = config['fx-nav-intensity']
		if(useCurtains){
			this.rootElement.removeClass('curtains-alpha').removeClass('curtains-static').removeClass('curtains-close').addClass('curtains')
		}
		if(this.revealTimer){
			clearTimeout(this.revealTimer)
		}
		this.revealTimer = setTimeout(() => {
			this.rootElement.addClass('playing')
			if(useCurtains){
				this.rootElement.removeClass('curtains')
			}
			if(!this.uiFrame) {
				this.uiFrame = jQuery(document.querySelector('iframe').contentWindow.document.body)
			}
			const c = this.uiFrame.attr('class')
			// console.warn('VIDEOCLASS* '+ c)
            if(c.indexOf('video-') == -1) { // no state set yet, add 'video-loading' so
				this.uiFrame.addClass('video video-loading')
			} else {
				this.uiFrame.addClass('video')
			}
			if(!(this.current instanceof VideoControlAdapterAndroidNative)) {
				this.container.style.display = 'flex'
				this.container.querySelectorAll('video, audio').forEach(e => {
					e.style.display = (e == this.current.object) ? 'block' : 'none'
				})
			}
		}, 400)
	}
	hide(){
		if(this.revealTimer){
			clearTimeout(this.revealTimer)
		}
		const useCurtains = config['fx-nav-intensity']
		this.rootElement.removeClass('playing')
		if(!this.uiFrame) {
			this.uiFrame = jQuery(document.querySelector('iframe').contentWindow.document.body)
		}
		this.uiFrame.removeClass('video video-loading video-playing video-paused')		
		if(useCurtains){
			this.rootElement.addClass('curtains-static').removeClass('curtains-alpha').removeClass('curtains').removeClass('curtains-close')
			setTimeout(() => {
				this.rootElement.addClass('curtains-close')
			}, 0)
		}
		this.container.style.display = 'none'
	}
	resume(){
		if(this.current){
			if(this.state == 'ended'){
				this.current.restart()
			} else {
				this.current.resume()
			}
		}
	}
	pause(){
		if(this.current){
			this.current.pause()
		}
	}
	volume(l){
		if(this.current){
			this.current.volume(l)
		}
	}
	muted(){
		if(this.current){
			return this.current.object.muted
		}
	}
	setState(s, err){
		if(this.state != s){
			this.state = s
			if(!this.suspendStateChangeReporting) this.emit('state', s, err)
		}
	}
	load(src, mimetype, cookie, mediatype, data){
		this.setState('loading')
		this.suspendStateChangeReporting = true
		this.current && this.current.unload(true)
		if(window.plugins && window.plugins.megacubo){
			this.setup('native', VideoControlAdapterAndroidNative)
		} else {
			let m = mimetype.toLowerCase()
			if(m.indexOf('mpegurl') != -1){
				this.setup('html5h', VideoControlAdapterHTML5HLS)
			} else if(m.indexOf('mp2t') != -1 || (src.endsWith('.ts') && mediatype == 'video') || (data && data.mpegts === true)){
				this.setup('html5t', VideoControlAdapterHTML5TS)
			} else if(m.indexOf('audio/') != -1){
				this.setup('html5a', VideoControlAdapterHTML5Audio)
			} else {
				this.setup('html5v', VideoControlAdapterHTML5Video)
			}
		}
		const current = this.current
		this.suspendStateChangeReporting = false
		current.errorsCount = 0
		try {
			current.load(src, mimetype, cookie, mediatype)

		} catch(err) {console.error(err)}
		this.current = current
		this.show()
		config && current.volume(config['volume'])
		document.body.style.backgroundColor = 'transparent'
		return current
	}
	setup(adapter, cls){
		this.adapter = adapter
		if(typeof(this.adapters[this.adapter]) == 'undefined'){
			const a = new (cls)(this.innerContainer)
			a.on('state', s => {
				if(typeof(s) == 'undefined') return
				if(!s && this.hasErr){
					s = 'error'
				}
				if(!this.suspendStateChangeReporting) this.setState(s, this.hasErr)
			})
			a.on('setup-ratio', r => {
				if(!this.current) return
				this.emit('setup-ratio', r)
			})
			a.on('timeupdate', n => {
				if(!this.current) return
				this.emit('timeupdate', n)
			})
			a.on('durationchange', () => {
				if(!this.current) return
				this.emit('durationchange', this.uiVisibility)
			})
			a.on('request-transcode', () => {
				if(!this.current) return
				this.emit('request-transcode')
			})
			a.on('audioTracks', tracks => {
				if(!this.current) return
				if(!this.equals(tracks, this.currentAudioTracks)){
					this.currentAudioTracks = tracks
					this.emit('audioTracks', tracks)
				}
			})
			a.on('subtitleTracks', tracks => {
				if(!this.current) return
				if(!this.equals(tracks, this.currentSubtitleTracks)){
					this.currentSubtitleTracks = tracks
					this.emit('subtitleTracks', tracks)
				}
			})
			a.on('error', (err, fatal) => {
				if(!this.current){
					try { // a.disconnect() is not a function
						a.disconnect()
						a.unload()
					} catch(e) { }
					return
				}
				if(this.clearErrTimer){
					clearTimeout(this.clearErrTimer)
				}
				if(fatal === true){
					this.state = 'error'
					if(!this.suspendStateChangeReporting) this.emit('state', this.state, err)
					a.unload()
				} else {
					this.hasErr = String(err)
					this.clearErrTimer = setTimeout(() => {
						this.hasErr = null
					}, 5000)
				}
			})
			a.on('ended', (err, fatal) => {
				if(!this.current) return
				this.suspendStateChangeReporting = true
				this.pause()
				setTimeout(() => {
					this.suspendStateChangeReporting = false
					this.setState('ended')
				}, 0)
			})
			a.config = typeof(config) == 'object' ? config : {}
			this.adapters[this.adapter] = a
		}
		return this.current = this.adapters[this.adapter]
	}
    equals(a, b){
		return a && b && a.length == b.length ? a.every((r, i) => {
			return a[i] === b[i]
		}) : false
    }
	audioTracks(){
		if(this.current){
			return this.current.audioTracks()
		}
		return []
	}
	audioTrack(trackId){
		if(this.current){
			this.current.audioTrack(trackId)
		}
	}
	subtitleTracks(){
		if(this.current){
			return this.current.subtitleTracks()
		}
		return []
	}
	subtitleTrack(trackId){
		if(this.current){
			this.current.subtitleTrack(trackId)
		}
	}
	unload(silent){
		silent || console.log('unload', traceback())
		if(this.current){
			this.current.unload(true)
			if(!silent) {
				this.hide()
				this.current = null
				this.setState('')
			}
		}
	}
}

class VideoControlAdapter extends EventEmitter {
	constructor(container){
		super()
		this.container = container
		this.active = false
	}
	setState(s, err){
		if(this.state != s){
			this.state = s
			if(!this.suspendStateChangeReporting) this.emit('state', s, err)
		}
	}
}

class VideoControlAdapterHTML5 extends VideoControlAdapter {
	constructor(container){
		super(container)
        this.lastSeenTime = 0
		this.state = ''
		this._ratio = 0
		this.hasReceivedRatio = false
		this.uiVisibility = true
		this.currentSrc = ''
		this.currentMimetype = ''
	}
	setup(tag){
		console.log('adapter setup')
		this.object = this.container.querySelector(tag)
		this.patchPauseFn()
	}
	patchPauseFn(){		
		if(typeof(this.object._pause) == 'undefined'){
			this.object._pause = this.object.pause
			this.object.pause = () => {} // prevent hls.js or browser from messing with playback
		}
	}
	uiVisible(visible){
		this.uiVisibility = visible
	}
	connect(){
		this.object.currentTime = 0
		const v = $(this.object)
		v.off()
		if(!this.object.parentNode){
			this.container.appendChild(this.object)
		}
        v.on('click', event => {
            let e = (event.target || event.srcElement)
            if(e.tagName && e.tagName.toLowerCase() == tag){
				this.emit('click')
            }
        })
		const onerr = e => {
			if(this.object.error){
				e = this.object.error
			}
			const t = this.time()
			const errStr = e ? String(e.message ? e.message : e) : 'unknown error'
			const isFailed = this.object.error || this.object.networkState == 3 || this.object.readyState < 2 || errStr.match(new RegExp('(pipeline_error|demuxer)', 'i'))
			console.error('Video error', t, this.errorsCount, e, errStr, this.object.networkState +', '+ this.object.readyState, isFailed)
			if(isFailed){
				this.errorsCount++
				if(this.errorsCount >= (t > 0 ? 20 : 2)){
					this.emit('error', String(e), true)
					this.setState('')
				} else {
					const c = this.errorsCount // load() will reset the counter
					this.suspendStateChangeReporting = true
					this.unload()
					setTimeout(() => {
						this.suspendStateChangeReporting = false
						this.setState('loading')
						this.load(this.currentSrc, this.currentMimetype)
						if(t){
							this.object.currentTime = t + 0.5 // nudge a bit to skip any decoding error on part of the file
						}
						this.errorsCount = c
					}, 10)
				}
			}
		}
		if(this.currentMimetype.match(new RegExp('(mpegts|mpegurl)', 'i'))){
			// let hls.js and mpegts.js do its own error handling first
			v.on('error', () => setTimeout(() => this.object.error && onerr(), 10))
		} else {
			v.on('error', onerr)
			const source = this.object.querySelector('source')
			if(source){ // for video only, hls.js uses src directly
				source.addEventListener('error', onerr)
			}
		}
		v.on('ended', e => {
			console.log('video ended', e)
            this.emit('ended', String(e))
		})
        v.on('timeupdate', event => {
			this.emit('timeupdate', this.object.currentTime)
			this.state === 'loading' && this.processState()
		})
        v.on('durationchange', event => {
			if(this.object.duration && this.duration != this.object.duration){
				this.duration = this.object.duration
				if(this.duration && this.errorsCount){
					this.errorsCount = 0
				}
			}
			this.emit('durationchange')
		})
        v.on('loadedmetadata', event => {
			if(this.object.videoHeight){
				let r = this.object.videoWidth / this.object.videoHeight
				if(r > 0 && !this.hasReceivedRatio){
					this.hasReceivedRatio = true
					this.emit('setup-ratio', r)
				}
				this.ratio(r)
			}
			this.emit('audioTracks', this.audioTracks())
			this.emit('subtitleTracks', this.subtitleTracks())
		});
		v.on('waiting', () => {
			this.isPlaying = false
			this.setState('loading')
		})
		v.on('playing', () => {
			this.isPlaying = true
			this.setState('playing')
		});
		['abort', 'canplay', 'canplaythrough', 'durationchange', 'emptied', 'ended', 'error', 'loadeddata', 'loadedmetadata', 'loadstart', 'pause', 'play', 'seeked', 'stalled', 'suspend'].forEach(n => {
			v.on(n, this.processState.bind(this))
		})
		this.processState()
	}
	disconnect(){
		$(this.object).off()
	}	
	recycle() {
		const p = this.object.parentNode
		if (p) {
			const v = document.createElement('video')
			$(this.object).off()
			v.autoplay = true
			p.removeChild(this.object)
			p.appendChild(v)
			this.object = v
			this.patchPauseFn()
		}
	}
	load(src, mimetype){
		if(this.currentSrc != src){
			this.currentSrc = src
			this.currentMimetype = mimetype
		}
		this._paused = false
		this.setState('loading')
		this.suspendStateChangeReporting = true
		this.unload(true)
		this.active = true
		console.log('adapter load')
		this.object.src = src
		this.connect()
		this.object.load()
		this.setState('loading')
		this.suspendStateChangeReporting = false
		this.resume()
		console.log('adapter resume', this.object.outerHTML, src, mimetype)
	}
	unload(silent){
		console.log('adapter unload')
		this.hasReceivedRatio = false
		if(this.active){
			this.active = false
			this.disconnect()
			if(this.object.currentSrc) {
				this.pause()
				if(!silent) {
					this.object.innerHTML = '<source type="video/mp4" src="" />'
					this.object.removeAttribute('src')
					this.object.load()
				}
			}
		}
	}
	resume(){
		this._paused = false
		let promise = this.object.play()
		if(promise){
			promise.catch(err => {
				if(this.active){
					console.error(err, err.message, this.object.networkState, this.object.readyState)
				}
			})
		}
	}
	pause(){
		this._paused = true
		this.object && this.object._pause && this.object._pause()
	}
	restart(){
		this.time(0)
		this.resume()
	}
	time(s){
		if(typeof(s) == 'number'){
			this.object.currentTime = s
		}
		return this.object.currentTime
	}
	ratio(s){
		if(typeof(s) == 'number'){
			let css, rd, wr, portrait
			if(window.innerWidth < window.innerHeight){
				portrait = true
				wr = window.innerHeight / window.innerWidth
			} else {
				wr = window.innerWidth / window.innerHeight
			}
			rd = (wr > s)
			console.log('ratiochange', rd, this.ratioDirection, wr, s, this._ratio)
			if(typeof(this.ratioDirection) == 'undefined' || this.ratioDirection != rd || s != this._ratio || portrait != this.inPortrait){
				this.inPortrait = portrait
				this._ratio = s
				this.ratioDirection = rd
				if(this.inPortrait){
					css = 'player > div { width: 100vw; height: calc(100vw / ' + this._ratio + '); }'
				} else {
					if(this.ratioDirection){
						css = 'player > div { height: 100vh; width: calc(100vh * ' + this._ratio + '); }'
					} else {
						css = 'player > div { width: 100vw; height: calc(100vw / ' + this._ratio + '); }'
					}
				}
            	if(!this.ratioCSS){
	                this.ratioCSS = document.createElement('style')
            	}
            	this.ratioCSS.innerText = ''
            	this.ratioCSS.appendChild(document.createTextNode(css))
            	document.querySelector("head, body").appendChild(this.ratioCSS)
				console.log('ratioupdated', this.inPortrait)
			}
		}
		return this._ratio
	}
	playbackRate(rate){
		if(typeof(rate) == 'number'){
			this.object.playbackRate = rate
		}
		return this.object.playbackRate
	}
	videoRatio(){
		if(!this.object.videoWidth){
			return 1.7777777777777777
		}
		return this.object.videoWidth / this.object.videoHeight
	}
	processState(){
		var s = ''
		if(this.active){
			if(this.object.paused){
				if(this._paused === true) {
					s = 'paused'
				} else {
					s = 'loading'
					this.object.play().catch(console.error)
				} 
			} else if(this.object.readyState < 4) { // if duration == Infinity, readyState will be 3		
				this.lastSeenTime = this.object.currentTime
				s = 'loading'
			} else {
				s = 'playing'
			}
		}
		this.setState(s)
	}
	volume(l){
		if(typeof(l) == 'number'){
			this.object.volume = l / 100
		}
	}
	audioTracks(){
		return this.formatTracks(this.object.audioTracks)
	}
	audioTrack(trackId){
		for (let i = 0; i < this.object.audioTracks.length; i++) {
			const enable = i == trackId || this.object.audioTracks[i].id == trackId
			this.object.audioTracks[i].enabled = enable
		}
	}
	subtitleTracks(){
		return this.formatTracks(this.object.subtitleTracks)
	}
	subtitleTrack(trackId){
		for (let i = 0; i < this.object.subtitleTracks.length; i++) {
			const enable = i == trackId || this.object.subtitleTracks[i].id == trackId
			this.object.subtitleTracks[i].enabled = enable
		}
	}
	formatTracks(tracks, activeId){
		if(!tracks || typeof(tracks) != 'object'){
			return []
		}
		if(!Array.isArray(tracks)){
			tracks = Array.from(tracks)
		}
		const allow = ['id', 'lang', 'language', 'enabled', 'label', 'name']
		return tracks.map((t, i) => {
			const ts = {}
			for(const k of allow) {
				if(t[k]) {
					ts[k] = t[k]
				}
			}
			if(typeof(ts.id) == 'undefined') {
				ts.id = i
			}
			if(typeof(activeId) != 'undefined' && activeId == ts.id){
				ts.enabled = true
			}
			return ts
		})
	}
	destroy(){
		console.log('adapter destroy')
		this.pause()
		this.unload()
		this.object = null
		this.removeAllListeners()
	}
}

class VideoControlAdapterHTML5Video extends VideoControlAdapterHTML5 {
	constructor(container){
		super(container)
        this.setup('video')
	}
}

class VideoControlAdapterHTML5Audio extends VideoControlAdapterHTML5 {
	constructor(container){
		super(container)
        this.setup('audio')
	}
}

class VideoControlAdapterAndroidNative extends VideoControlAdapter {
	constructor(container){
		super(container)
		this.object = window.plugins['megacubo'] || {}
		this.state = ''
		this.duration = 0
		this.currentTime = 0
		this.hasReceivedRatio = false
		this.aspectRatio = 1.7777777777777777
		this.object.on('ratio', e => {
			console.log('RECEIVED RATIO', e)
			if(e.ratio > 0 && !this.hasReceivedRatio){
				this.hasReceivedRatio = true
				this.emit('setup-ratio', e.ratio)
			}
		})
		this.object.on('state', state => {
			if(state != this.state){
				if(state == 'paused' && !this.duration){
					state = 'loading'
				}
				this.state = state
				if(!this.suspendStateChangeReporting) this.emit('state', this.state)
			}
		})
		this.object.on('timeupdate', () => {
			if(!this.active) return
			this.currentTime = this.object.currentTime
			this.emit('timeupdate', this.object.currentTime)
		})
		this.object.on('durationchange', () => {
			this.duration = this.object.duration
			this.emit('durationchange')
		})
		this.object.on('audioTracks', tracks => {
			this.emit('audioTracks', tracks)
		})		
		this.object.on('subtitleTracks', tracks => {
			this.emit('subtitleTracks', tracks)
		})		
		this.object.on('error', (err, data) => {
			console.log('Error: ', err, 'data:', data)
			this.emit('error', String(err), true)
			this.state = ''
			this.emit('state', '')
		})
	}
	uiVisible(visible){
		this.object.uiVisible(visible)
	}
	load(src, mimetype, cookie, mediatype){
		this.active = true
		this.currentTime = 0
		this.duration = 0
		this.state = 'loading'
		this.emit('state', this.state)
		this.object.setBackBuffer(config['live-window-time'] * 1000)
		this.object.play(src, mimetype, cookie, mediatype, this.successCallback.bind(this), this.errorCallback.bind(this))
	}
	successCallback(){
		console.warn('exoplayer success', arguments)
	}
	errorCallback(...args){
		console.error('exoplayer err', args)
		this.emit('error', args.length ? args[0] : 'Exoplayer error', true)
		this.state = ''
		this.emit('state', '')
		//console.error(err, arguments)
		//this.stop()
		//this.emit('error', err)
	}
	unload(){
		this.hasReceivedRatio = false
		this.active = false
		this.object.stop()
	}
	resume(){
		this.object.resume()
	}
	pause(){
		this.object.pause()
	}
	restart(){
		this.time(0)
		this.resume()
	}
	time(s){
		if(typeof(s) == 'number'){
			this.currentTime = s
			this.object.seek(s)
		}
		return this.currentTime
	}
	ratio(s){
		if(typeof(s) == 'number'){
			this.object.ratio(s)
		}
		return this.object.aspectRatio
	}	
	playbackRate(rate){
		if(typeof(rate) == 'number'){
			console.warn('SET PLAYBACK RATE', rate)
			this.object.setPlaybackRate(rate)
		}
		return this.object.playbackRate
	}
	videoRatio(){
		return this.object.aspectRatio
	}	
	volume(l){
		this.object.volume(l)
	}
	audioTrack(trackId){
		return this.object.audioTrack(trackId)
	}
	audioTracks(){
		return this.object.audioTracks()
	}
	subtitleTrack(trackId){
		return this.object.subtitleTrack(trackId)
	}
	subtitleTracks(){
		return this.object.subtitleTracks()
	}
	destroy(){
		this.unload()
		this.removeAllListeners()
	}
}

window.player = new VideoControl(document.querySelector('player'))

if(!parent.cordova){
	['play', 'pause', 'seekRewindward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack', 'skipad'].forEach(n => {
		// disable media keys on this frame
		try {
			navigator.mediaSession.setActionHandler(n, function() {})
		} catch(e){}
	})
}

document.querySelector('iframe#app').src = './app.html'
