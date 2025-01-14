
streamer.zappingIcon = 'fas fa-random'
app.on('is-zapping', (state, skipOSD) => {
    streamer.isZapping = state
    if(state){
        if(skipOSD) {
            osd.hide('zap')
        } else {
            osd.hide('streamer')
            osd.show(lang.ZAPPING, streamer.zappingIcon, 'zap', 'persistent')
        }
    } else {
        osd.hide('zap')
    }
})
app.on('streamer-connect', () => {
    streamer.enablePlayerButton('zap', !!streamer.isZapping)
    streamer.enablePlayerButton('tune', !streamer.isZapping)
})