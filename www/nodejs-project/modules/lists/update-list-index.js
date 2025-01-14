const fs = require('fs'), Events = require('events'), Parser = require('./parser')
const ListIndexUtils = require('./list-index-utils')
const MediaURLInfo = require('../streamer/utils/media-url-info')

class UpdateListIndex extends ListIndexUtils { 
	constructor(url, directURL, file, master, updateMeta, forceDownload){
		super()
        this.url = url
        this.file = file
		this.playlists = []
        this.master = master
        this.lastProgress = -1
        this.directURL = directURL
        this.updateMeta = updateMeta
        this.forceDownload = forceDownload === true
        this.tmpfile = global.paths.temp +'/'+ parseInt(Math.random() * 100000000000) + '.tmp'
        this.linesMapPtr = 0
        this.linesMap = []
        this.reset()
    }
    ext(file){
		let basename = String(file).split('?')[0].split('#')[0].split('/').pop()
		basename = basename.split('.')
		if(basename.length > 1){
			return basename.pop().toLowerCase()
		} else {
			return ''
		}
    }
	indexate(entry, i){
		entry = this.master.prepareEntry(entry)
		entry.terms.name.concat(entry.terms.group).forEach(term => {
			if(typeof(this.index.terms[term]) == 'undefined'){
				this.index.terms[term] = {n: [], g: []}
			}
		})
		entry.terms.name.forEach(term => {
            // ensure it's an array an not a method
			if(Array.isArray(this.index.terms[term].n) && !this.index.terms[term].n.includes(i)){
				this.index.terms[term].n.push(i)
			}
		})
		entry.terms.group.forEach(term => {
			if(Array.isArray(this.index.terms[term].n) && !this.index.terms[term].g.includes(i)){
				this.index.terms[term].g.push(i)
			}
		})
        if(entry.name && entry.gid){
            if(typeof(this.index.gids) == 'undefined'){
                this.index.gids = {}
            }
            if(typeof(this.index.gids[entry.gid]) == 'undefined'){
                this.index.gids[entry.gid] = []
            }
            if(!this.index.gids[entry.gid].includes(entry.name)){
                this.index.gids[entry.gid].push(entry.name)
            }
        }
		if(typeof(this.index.groups[entry.group]) == 'undefined'){
			this.index.groups[entry.group] = []
		}
		this.index.groups[entry.group].push(i)
		return entry
	}
    parseHeadersMeta(headers) {
        const prefix = 'x-m3u-meta-'
        Object.keys(headers).filter(k => k.startsWith(prefix)).forEach(k => {
            const name = k.substr(prefix.length)
            this.index.meta[name] = headers[k]
        })
    }
	fetch(path){
		return new Promise((resolve, reject) => {
            if(path.match(new RegExp('^//[^/]+\\.'))){
                path = 'http:' + path
            }
            if(path.match(new RegExp('^https?:'))){
                console.error('ADDLISThttp='+path)
                let resolved
                const opts = {
                    debug: false,
                    url: path,
                    p2p: !!this.forceDownload,
                    retries: 3,
                    followRedirect: true,
                    keepalive: false,
                    headers: {
                        'accept-charset': 'utf-8, *;q=0.1'
                    },
                    timeout: Math.max(30, global.config.get('connect-timeout')), // some servers will take too long to send the initial response
                    downloadLimit: 200 * (1024 * 1024), // 200Mb
                    cacheTTL: this.forceDownload ? 0 : 3600,
                    debug: false
                }
                this.stream = new global.Download(opts)
                const file = global.paths.temp + '/'+ this.stream.opts.uid +'.bin'
                this.stream.on('redirect', (url, headers) => this.parseHeadersMeta(headers))
                this.stream.on('response', (statusCode, headers) => {
                    if(this.debug){
                        console.log('response', statusCode, headers, this.updateMeta)
                    }
                    resolved = true
                    this.parseHeadersMeta(headers)
                    if(statusCode >= 200 && statusCode < 300){
                        this.contentLength = this.stream.totalContentLength
                        if(this.stream.totalContentLength > 0 && (this.stream.totalContentLength == this.updateMeta.contentLength)){
                            this.stream.destroy()
                            resolve(false) // no need to update
                        } else {
                            const fetcher = fs.createWriteStream(file)
                            this.stream.on('data', c => fetcher.write(c))
                            this.stream.on('end', () => {
                                fetcher.on('close', () => this.parser && this.parser.end())
                                fetcher.end()
                            })
                            resolve({file, persistent: true})
                        }
                    } else {
                        this.stream.destroy()
                        reject('http error '+ statusCode)
                    }
                })
                this.stream.on('end', () => {
                    if(this.debug){
                        console.log('end')
                    }
                    this.stream && this.stream.destroy()
                    if(!resolved) {
                        resolved = true
                        reject('unknown http error')
                    }
                })
                this.stream.on('error', e => {
                    if(this.debug){
                        console.log('err', e)
                    }
                })
                this.stream.start()
            } else {
                const file = path
                fs.stat(file, (err, stat) => {
                    if(stat && stat.size){
                        this.contentLength = stat.size
                        if(stat.size > 0 && stat.size == this.updateMeta.contentLength){
                            resolve(false) // no need to update
                        } else {
                            resolve({file, persistent: false})
                        }
                    } else {
                        reject('file not found or empty*')
                    }
                })
            }
        })
	}
	async start(){
        let alturl, urls = [this.directURL], fmt = global.config.get('live-stream-fmt')
        if(['hls', 'mpegts'].includes(fmt)) {
            if(!this.mi) {
                this.mi = new MediaURLInfo()
            }
            alturl = this.mi.setURLFmt(this.directURL, fmt)
            if(alturl){
                urls.unshift(alturl)
            }
        }
        await fs.promises.mkdir(global.dirname(this.tmpfile), {recursive: true}).catch(console.error)
        const writer = fs.createWriteStream(this.tmpfile)
        for(let url of urls){
            let err
            const ret = await this.fetch(url).catch(e => err = e)
            if(!err && ret){
                await this.parse(ret, writer).catch(console.error)
                if(this.indexateIterator) break
            }
        }
        let i = 0
        while(i < this.playlists.length){
            let err
            const playlist = this.playlists[i]
            i++
            const ret = await this.fetch(playlist.url).catch(e => err = e)
            console.error('PLAYLIST '+ playlist.url +' '+ this.indexateIterator +' '+ err)
            if(!err && ret){
                await this.parse(ret, writer, playlist).catch(console.error)
            }
        }
        console.error('PLAYLISTS end')
        await this.writeIndex(writer).catch(err => console.warn('writeIndex error', err))
        writer.destroy()
        return true
	}
	parse(opts, writer, playlist){
		return new Promise((resolve, reject) => {
			let resolved, count, destroyListener = () => {
                if(!resolved){
                    resolved = true
                    fs.unlink(this.tmpfile, () => {})
                    reject('destroyed')
                }
            }
            this.parser && this.parser.destroy()
            this.parser = new Parser(opts)
			this.parser.on('meta', meta => {
				Object.assign(this.index.meta, meta)
			})
			this.parser.on('playlist', e => {
                this.playlists.push(e)
			})
			this.parser.on('entry', entry => {
                count++
				if(this.destroyed){
                    if(!resolved){
                        resolved = true
                        reject('destroyed')
                    }
                    return
				}
                if(playlist){
                    entry.group = global.joinPath(global.joinPath(playlist.group, playlist.name), entry.group)
                }
                if(entry.group) { // collect some data to sniff after if each group seems live, serie or movie
                    if(typeof(this.groups[entry.group]) == 'undefined') {
                        this.groups[entry.group] = []
                    }
                    this.groups[entry.group].push({
                        name: entry.name,
                        url: entry.url,
                        icon: entry.icon
                    })
                }
                entry = this.indexate(entry, this.indexateIterator)
                const line = JSON.stringify(entry) + "\n"
                writer.write(line)
                this.linesMap.push(this.linesMapPtr)
                this.linesMapPtr += Buffer.byteLength(line, 'utf8')
                if(!this.uniqueStreamsIndexate.has(entry.url)) {
                    this.uniqueStreamsIndexate.set(entry.url, null)
                    this.uniqueStreamsIndexateIterator++
                }
                this.indexateIterator++
			})
            this.parser.on('progress', readen => {
                const cl = this.contentLength > 0 ? this.contentLength : 62 * (1024 * 1024) // estimate it if we don't know
                const pp = cl / 100
                let progress = parseInt(readen / pp)
                if(progress > 99) progress = 99

                if(this.playlists.length){
                    let i = -1
                    this.playlists.some((p, n) => {
                        if(!playlist || playlist.url == p.url){
                            i = n
                            return true
                        }
                    })
                    if(i != -1){
                        const lr = 100 / (this.playlists.length + 1)
                        const pr = (i * lr) + (progress * (lr / 100))
                        progress = parseInt(pr)
                    }
                }

                if(progress != this.lastProgress) {
                    this.lastProgress = progress
                    this.emit('progress', progress)
                }
            })
            this.once('destroy', destroyListener)
			this.parser.once('finish', () => {
                this.removeListener('destroy', destroyListener)
                if(!resolved){
                    resolved = true
                    if(count){
                        resolve(true)
                    } else {
                        reject('empty list')
                    }
                    if(this.contentLength <= 0){
                        this.contentLength = this.stream.received
                    }
                    this.parser.destroy()
                    this.stream && this.stream.destroy()
                    this.stream = this.parser = null
                }
			})
		})
	}
    writeIndex(writer){
        return new Promise((resolve, reject) => {
            fs.stat(this.file, (err, stat) => {
                let resolved
                const exists = !err && stat && stat.size
                this.index.length = this.indexateIterator
                this.index.uniqueStreamsLength = this.uniqueStreamsIndexateIterator
                this.index.groupsTypes = this.sniffGroupsTypes(this.groups)
                if(this.index.length || !exists) {
                    const finish = err => {
                        if(resolved) return
                        resolved = true
                        if(err) console.error(err)
                        global.moveFile(this.tmpfile, this.file, err => {
                            if(err){
                                reject(err)
                            } else if(this.index.length) {
                                resolve(true)
                            } else {
                                resolve(false)
                            }
                            fs.access(this.tmpfile, err => err || fs.unlink(this.tmpfile, () => {}))
                        }, 10)
                    }
                    writer.on('finish', finish)
                    writer.on('close', finish)
                    writer.on('error', finish)
                    
                    const indexLine = JSON.stringify(this.index) +"\n"
                    this.linesMap.push(this.linesMapPtr)
                    this.linesMapPtr += Buffer.byteLength(indexLine, 'utf8')
                    this.linesMap.push(this.linesMapPtr)

                    const linesMapLine = JSON.stringify(this.linesMap)
                    writer.write(indexLine + linesMapLine)
                    writer.end()
                } else {
                    resolved = true
                    fs.unlink(this.tmpfile, () => reject('empty list'))
                }
            })
        })
    }
    sniffGroupsTypes(groups){
        const ret = {live: [], vod: [], series: []}
        Object.keys(groups).forEach(g => {
            let icon
            const isSeried = this.isGroupSeried(groups[g])
            const types = groups[g].map(e => {
                if(e.icon && !icon){
                    icon = e.icon
                }
                return isSeried ? 'series' : this.sniffStreamType(e)
            }).filter(s => s)
            const type = this.mode(types)
            if(type){
                ret[type].push({ name: g, icon })
            }
        })
        return ret
    }
    isGroupSeried(es){
        if(es.length < 5) return false
        const masks = {}
        const mask = n => n.replace(new RegExp('[0-9]+', 'g'), '*')
        es.forEach(e => {
            const m = mask(e.name)
            if(typeof(masks[m]) == 'undefined') masks[m] = 0
            masks[m]++
        })
        return Object.values(masks).some(n => n >= (es.length * 0.7))
    }
    mode(a){ // https://stackoverflow.com/a/65821663
        let obj = {}
        let maxNum
        let maxVal
        for(let v of a){
            obj[v] = ++obj[v] || 1
            if(maxVal === undefined || obj[v]> maxVal){
                maxNum = v
                maxVal = obj[v]
            }
        }
        return maxNum
    }
    rdomain(u){
        if(u && u.indexOf('//') != -1){
            return u.split('//')[1].split('/')[0].split(':')[0].split('.').slice(-2)
        }
        return ''
    }
	reset(){	
        this.groups = {}
		this.index = {
            length: 0,
            uniqueStreamsLength: 0,
            terms: {},
            groups: {},
            meta: {},
            gids: {}
        }
		this.indexateIterator = 0
		this.uniqueStreamsIndexate = new Map()
		this.uniqueStreamsIndexateIterator = 0
		this.contentLength = -1
	}
	destroy(){
		if(!this.destroyed){
			this.reset()
            if(this.stream){
                this.stream.destroy()
                this.stream = null
            }
            if(this.parser){
                this.parser.destroy()
                delete this.parser
            }
			this.destroyed = true
			this.emit('destroy')
            this.removeAllListeners()
			this._log = []
		}
	}
}

module.exports = UpdateListIndex
