let appId = 'E3F46EBD'
let audioTrack = null
let captionTrack = null
let lastCaptionTrack = null

// Cast API window callback
window['__onGCastApiAvailable'] = isAvailable => {
	console.log('Google Cast is available')
	if (isAvailable)
		initializeCastApi();
}

// add script element for Cast API
const injectedCast = document.createElement('script')
injectedCast.type = 'text/javascript'
injectedCast.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
document.body.appendChild(injectedCast)

const initializeCastApi = () => {
	cast.framework.CastContext.getInstance().setOptions({
		receiverApplicationId: appId,
		autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
	})

	launcher = document.createElement('google-cast-launcher')
	launcher.style.width = '18px'
	launcher.style.marginTop = '9px'
	const playerRight = document.getElementsByClassName('cb-right-items')[0]
	playerRight.appendChild(launcher)

	remotePlayer = new cast.framework.RemotePlayer()
	remotePlayerController = new cast.framework.RemotePlayerController(remotePlayer)
	remotePlayerController.addEventListener(cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED, event => {
		isCasting = event.value
		console.log('connection change', isCasting)

		playOrPause()
		if (isCasting)
			connectCastPlayer()
		else 
			localPlayer.currentTime = remotePlayerTime
		updateUIForCast()
	})
	
	console.log('cast api initialized')
	console.log('is live:', isLive)
	console.log('stream url', streamUrl)
}

const connectCastPlayer = async () => {
	console.log('loading media')
	castSession = cast.framework.CastContext.getInstance().getCurrentSession()

	// pull stream url from DOM if it's there
	let streamUrlElement = document.querySelector('[data-channel-stream-url]')
	if (streamUrlElement)
		streamUrl = streamUrlElement.getAttribute('data-channel-stream-url')

	console.log('stream url', streamUrl)
	let mediaInfo = new chrome.cast.media.MediaInfo(streamUrl, 'application/x-mpegURL')
	mediaInfo.streamType = isLive ? chrome.cast.media.StreamType.LIVE : chrome.cast.media.StreamType.BUFFERED
	// mediaInfo.duration = isLive ? null : localPlayer.duration

	mediaInfo.customData = document.cookie
	let request = new chrome.cast.media.LoadRequest(mediaInfo)
	request.currentTime = isLive ? null : castSession.getMediaSession() ? remotePlayerTime : localPlayer.currentTime
	
	castSession.loadMedia(request)
		.then(() => {
			console.log('Media loaded')

			castSession.getMediaSession().addUpdateListener(isAlive => {
				if (isAlive)
					remotePlayerTime = castSession.getMediaSession().getEstimatedTime()
			})
		}, 
		errorCode => {
			console.log(`Cast error loading media: ${errorCode}`)
			isCasting = false
			updateUIForCast()
		})
}

document.addEventListener('stream-load', ({ detail: url }) => {
	streamUrl = url
	console.log('loaded stream tokenized url', streamUrl)

	// load new stream
	if (isCasting)
		connectCastPlayer()
})

function stopCasting() {
	var castSession = cast.framework.CastContext.getInstance().getCurrentSession()
  castSession.endSession(true)
}

function updateUIForCast() {
	let shade = document.getElementById('cast-shade')
	let description = document.getElementsByClassName('_1WHOy')[1]

	if (!shade) {
		shade = document.createElement('div')
		shade.id = 'cast-shade'
		shade.innerHTML = `
			<div class="cast-shade-content">
				<h3 class="cast-shade-title">CASTING VIDEO</h3>
				<button onclick="stopCasting()">Stop Casting</button>
			</div>
		`
		description.appendChild(shade)
	}

	if (isCasting) {
		// player.style.display = 'none'
		shade.style.display = 'block'
	}
	else {
		// player.style.display = 'block'
		shade.style.display = 'none'
	}
}

function updateAudioTrack(trackName) {
	updateTrack(trackName, 'AUDIO')
}

function updateCaptionTrack(trackName) {
	updateTrack(trackName, 'TEXT')
}

function updateTrack(trackName, type) {
	let session = castSession.getMediaSession()
	let { media } = session

	let newTrack = media.tracks
		.filter(t => t.type === type)
		.find(t => t.name === trackName)

	console.log('new track', newTrack)
	
	if (type === 'AUDIO')
		audioTrack = newTrack.trackId
	else if (type === 'TEXT') {
		captionTrack = newTrack.trackId
		lastCaptionTrack = captionTrack
	}

	updateTracks(session)
}

function updateTracks(session) {
	let { media } = session
	let trackSet = []

	// use old audio track if audio track is null
	if (!audioTrack) {
		let oldAudioTracks = session.activeTrackIds
			.map(id => media.tracks.find(t => t.trackId == id))
			.filter(t => t.type === 'AUDIO')
		
		if (oldAudioTracks && oldAudioTracks.length > 0)
			audioTrack = oldAudioTracks[0].trackId
	}

	// use old caption track if caption track is null
	if (!captionTrack) {
		let oldCaptionTracks = session.activeTrackIds
			.map(id => media.tracks.find(t => t.trackId == id))
			.filter(t => t.type === 'TEXT')
		
		if (oldCaptionTracks && oldCaptionTracks.length > 0)
			captionTrack = oldCaptionTracks[0].trackId
	}

	if (audioTrack)
		trackSet.push(audioTrack)
	if (captionTrack && closedCaptionsEnabled)
		trackSet.push(captionTrack)

	console.log('track set', trackSet)

  let tracksInfoRequest = new chrome.cast.media.EditTracksInfoRequest(trackSet)
	session
		.editTracksInfo(
			tracksInfoRequest,
			() => console.log('updated tracks'),
			(error) => console.log('error updating tracks', error)
		)
}

const stopListener = () => {
	localPlayer.currentTime = remotePlayerTime
	castSession.removeUpdateListener(this)
}