
class VideoControlAdapterHTML5TS extends VideoControlAdapterHTML5Video {
	constructor(container){
		super(container)
		this.currentSrc = ''
        this.setup('video')
    }
	load(src, mimetype, cookie, type){
		if(!src){
			console.error('Bad source', src, mimetype, traceback())
			return
		}
		console.warn('Load source', src)
		this.active = true
		this.engineType = type
		if(this.currentSrc != src){
			this.currentSrc = src
			this.currentMimetype = mimetype
		}
        this.mpegts = mpegts.createPlayer({
            type: 'mse',  // could be mse, mpegts, m2ts, flv
            url: this.currentSrc,
            isLive: true
		}, {
            lazyLoad: false,
            enableWorker: true,
            autoCleanupSourceBuffer: true
        })
        this.mpegts.attachMediaElement(this.object)
		this.errorListener = err => {
            console.error('MPEGTS ERROR', err)
			const t = this.time()			
			this.errorsCount++
			if(t != this.lastErrorTime && this.errorsCount >= (t > 0 ? 20 : 3)){
				this.emit('error', String(err), true)
				this.state = ''
				this.emit('state', '')
			} else {
				const c = this.errorsCount // load() may reset the counter
				if(this.object.error){					
					this.mpegts.detachMediaElement()
					console.warn('!! RENEWING VIDEO OBJECT')
					this.recycle()
					this.mpegts.attachMediaElement(this.object)
				}
				this.mpegts.unload()
				this.mpegts.load()
				this.mpegts.play()
				this.errorsCount = c
			}
			this.lastErrorTime = t
        }
		this.logListener = (type, message) => {
			if(String(message).indexOf('sync_byte') != -1){
				this.errorListener(message)
			}
		}
		const v = $(this.object)
		v.on('error', err => {
			if(this.object.error){
				this.mpegts.detachMediaElement()
				console.warn('!! RENEWING VIDEO OBJECT')
				this.recycle()
				this.mpegts.attachMediaElement(this.object)
				this.mpegts.play()
			}
		})
        this.mpegts.on(mpegts.Events.ERROR, this.errorListener)
        this.mpegts.unload()
        this.mpegts.load()
        this.mpegts.play()
		mpegts.LoggingControl.addLogListener(this.logListener)
		this.connect()
	}
	unload(){
		console.log('unload ts')
		if(this.mpegts){
			console.log('unload ts disconnect')
			this.disconnect()
            this.mpegts.unload()
            this.mpegts.detachMediaElement()
            this.mpegts.destroy()
            this.mpegts = null
			if(this.logListener){
				mpegts.LoggingControl.removeLogListener(this.logListener)
				delete this.logListener
			}
			this.object.src = ''
			console.log('unload ts super.unload')
			super.unload()
			console.log('unload ts OK')
		}
	}
    destroy(){
		console.log('ts destroy')
		this.unload()
		super.destroy()
    }
}