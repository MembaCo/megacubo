const Writer = require('./writer')

class WriteQueue {
	constructor(){
		this.pool = {}
	}
	write(file, data, position){
		if(typeof(this.pool[file]) == 'undefined'){
			this.pool[file] = new Writer(file)
			this.pool[file].once('end', () => {
				this.pool[file].destroy()
				delete this.pool[file]
			})
		}
		if(!Buffer.isBuffer(data)){
			data = Buffer.from(data)
		}
		this.pool[file].write(data, position)
	}
	ready(file, cb){
		if(typeof(this.pool[file]) == 'undefined'){
			cb()
		} else {
			this.pool[file].ready(cb)
		}
	}
}

module.exports = new WriteQueue()
