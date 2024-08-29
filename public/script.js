let clientId;
let clientSecret;
let accessToken = '';
let currentTrack = null;
let currentAudio = null;
let currentPlayingItem = null;

async function fetchConfig() {
  const response = await fetch('/config');
  const config = await response.json();
  clientId = config.SPOTIFY_CLIENT_ID;
  clientSecret = config.SPOTIFY_CLIENT_SECRET;
}

async function getAccessToken() {
    if (!clientId || !clientSecret) {
        await fetchConfig();
    }
    const result = await axios.post('https://accounts.spotify.com/api/token', 
        'grant_type=client_credentials',
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
            }
        }
    );
    accessToken = result.data.access_token;
}

async function search() {
    if (!accessToken) await getAccessToken();

    const query = document.getElementById('searchInput').value;
    const result = await axios.get(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=10`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    displaySearchResults(result.data.tracks.items);
    resetZoom();
}

function displaySearchResults(tracks) {
    let searchResults = document.querySelector('.search-results');

    if (!searchResults) {
        searchResults = document.createElement('div');
        searchResults.className = 'search-results';
        document.querySelector('.search-container').appendChild(searchResults);
    }

    searchResults.innerHTML = '';
    searchResults.style.display = 'block';

    tracks.forEach((track, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';
        resultItem.innerHTML = `
            <img src="${track.album.images[2].url}" alt="${track.name}">
            <div>
                <div>${track.name}</div>
                <div>${track.artists[0].name}</div>
            </div>
        `;
        resultItem.onclick = () => selectTrack(track);
        searchResults.appendChild(resultItem);

        anime({
            targets: resultItem,
            opacity: [0, 1],
            translateY: [10, 0],
            easing: 'easeOutQuad',
            duration: 300,
            delay: index * 50
        });
    });

    anime({
        targets: searchResults,
        opacity: [0, 1],
        translateY: [-10, 0],
        duration: 300,
        easing: 'easeOutQuad'
    });

    document.querySelector('main').style.display = 'none';
}

async function selectTrack(track) {
    stopCurrentAudio();

    const searchResults = document.querySelector('.search-results');
    if (searchResults) {
        anime({
            targets: searchResults,
            opacity: 0,
            translateY: -10,
            duration: 300,
            easing: 'easeOutQuad',
            complete: () => {
                searchResults.style.display = 'none';
            }
        });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }

    const main = document.querySelector('main');
    if (main) {
        main.style.display = 'flex';
        anime({
            targets: main,
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 600,
            easing: 'easeOutQuad'
        });
    }

    const albumImage = document.getElementById('albumImage');
    if (albumImage) {
        albumImage.src = track.album.images[0].url;
        anime({
            targets: albumImage,
            scale: [0.9, 1],
            opacity: [0, 1],
            duration: 800,
            easing: 'spring(1, 90, 12, 0)'
        });
    }

    const songTitle = document.getElementById('songTitle');
    if (songTitle) {
        songTitle.textContent = `'${track.name}'`;
        anime({
            targets: songTitle,
            opacity: [0, 1],
            translateX: [-20, 0],
            duration: 600,
            easing: 'easeOutQuad',
            delay: 200
        });
    }

    const artistInfo = await getArtistInfo(track.artists[0].id);

    const additionalDetails = document.getElementById('additionalDetails');
    if (additionalDetails) {
        additionalDetails.innerHTML = '';
        const details = [
            `Album: ${track.album.name}`,
            `Released: ${track.album.release_date}`,
            `Genres: ${artistInfo.genres.join(', ') || 'N/A'}`
        ];
        details.forEach((detail, index) => {
            const p = document.createElement('p');
            p.textContent = detail;
            additionalDetails.appendChild(p);
            anime({
                targets: p,
                opacity: [0, 1],
                translateX: [-20, 0],
                duration: 600,
                easing: 'easeOutQuad',
                delay: 400 + index * 100
            });
        });
    }

    const artistInfoContainer = document.createElement('div');
    artistInfoContainer.className = 'artist-info';
    artistInfoContainer.innerHTML = `
        <img id="artistImage" src="${artistInfo.images[0]?.url || '/path/to/default-artist-image.jpg'}" alt="${artistInfo.name}">
        <div class="artist-details">
            <h3 id="artistName">${artistInfo.name}</h3>
            <p id="artistFollowers">${formatNumber(artistInfo.followers.total)} followers</p>
        </div>
    `;
    additionalDetails.appendChild(artistInfoContainer);

    anime({
        targets: artistInfoContainer,
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 600,
        easing: 'easeOutQuad',
        delay: 800
    });

    const userInstructions = document.createElement('p');
    userInstructions.className = 'user-instructions';
    userInstructions.textContent = 'Click album art to play/pause songs. Some songs may not have a preview available.';
    additionalDetails.appendChild(userInstructions);

    anime({
        targets: userInstructions,
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 600,
        easing: 'easeOutQuad',
        delay: 1000
    });

    getRecommendations(track);
    resetZoom();
}

async function getArtistInfo(artistId) {
    const result = await axios.get(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    return result.data;
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function getArtistGenres(artistId) {
    const result = await axios.get(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    return result.data.genres;
}

async function getRecommendations(track) {
    console.log('Starting getRecommendations for track:', track.name);
    const audioFeatures = await getAudioFeatures(track.id);
    const seedGenres = await getArtistGenres(track.artists[0].id);
    console.log('Seed genres:', seedGenres);

    const excludedGenres = ['pop', 'rock', 'rap', 'hip hop', 'r&b', 'country', 'electronic', 'jazz', 'classical'];
    const specificGenres = seedGenres.filter(genre => 
        !excludedGenres.includes(genre.toLowerCase())
    );
    console.log('Specific genres:', specificGenres);

    const params = new URLSearchParams({
        seed_tracks: track.id,
        target_danceability: audioFeatures.danceability,
        target_energy: audioFeatures.energy,
        target_valence: audioFeatures.valence,
        limit: 100
    });

    let minPopularity, maxPopularity;
    if (track.popularity > 60) {
        maxPopularity = track.popularity - 15;
        minPopularity = Math.max(0, maxPopularity - 30);
    } else if (track.popularity > 35) {
        maxPopularity = track.popularity - 5;
        minPopularity = Math.max(0, maxPopularity - 30);
    } else {
        maxPopularity = track.popularity + 10;
        minPopularity = Math.max(0, track.popularity - 20);
    }
    params.append('min_popularity', minPopularity);
    params.append('max_popularity', maxPopularity);
    console.log('Popularity range:', minPopularity, '-', maxPopularity);

    if (specificGenres.length > 0) {
        params.append('seed_genres', specificGenres.slice(0, 2).join(','));
    }

    console.log('Requesting recommendations with params:', params.toString());
    const result = await axios.get(`https://api.spotify.com/v1/recommendations?${params.toString()}`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    console.log('Received', result.data.tracks.length, 'recommendations');

    const filteredTracks = result.data.tracks.filter(t => 
        t.id !== track.id && 
        t.artists[0].id !== track.artists[0].id &&
        Math.abs(t.duration_ms - track.duration_ms) <= 240000
    );
    console.log('Filtered to', filteredTracks.length, 'tracks');

    displayRecommendations(filteredTracks);
    return filteredTracks;
}

function isValidRecommendation(track) {
    const excludedGenres = ['pop', 'rock', 'rap', 'hip hop', 'r&b', 'country', 'electronic', 'jazz', 'classical'];
    return !excludedGenres.some(genre => track.genres?.some(trackGenre => trackGenre.toLowerCase().includes(genre)));
}

function displayRecommendations(tracks) {
    const recommendationsContainer = document.querySelector('.recommendations');
    recommendationsContainer.innerHTML = '';
    recommendationsContainer.style.opacity = '0';  

    const uniqueArtists = new Set();
    const displayedTracks = [];

    for (const track of tracks) {
        if (!uniqueArtists.has(track.artists[0].id) && displayedTracks.length < 12) {
            uniqueArtists.add(track.artists[0].id);
            displayedTracks.push(track);
        }
    }

    displayedTracks.forEach(track => {
        const recommendationItem = createRecommendationItem(track);
        recommendationItem.style.opacity = '0';  
        recommendationsContainer.appendChild(recommendationItem);
    });

    
    requestAnimationFrame(() => {
        recommendationsContainer.style.opacity = '1';  
        animateRecommendations();
    });
}

function animateRecommendations() {
    anime({
        targets: '.recommendations .recommendation-item',
        opacity: [0, 1],
        translateY: [20, 0],
        scale: [0.9, 1],
        delay: anime.stagger(50),
        easing: 'spring(1, 80, 10, 0)',
        duration: 600,
        begin: function(anim) {
            document.querySelector('.recommendations').style.opacity = '1';
        }
    });
}

function createRecommendationItem(track) {
    const recommendationItem = document.createElement('div');
    recommendationItem.className = 'recommendation-item';
    recommendationItem.innerHTML = `
        <img src="${track.album.images[1].url}" alt="${track.name}">
        <div>
            <p class="song-name">${track.name}</p>
            <p class="artist-name">${track.artists[0].name}</p>
        </div>
        ${track.preview_url ? `<audio src="${track.preview_url}"></audio>` : ''}
    `;

    const img = recommendationItem.querySelector('img');
    img.addEventListener('click', (e) => {
        e.stopPropagation();
        handleRecommendationPlay(recommendationItem, track);
    });

    const songName = recommendationItem.querySelector('.song-name');
    const artistName = recommendationItem.querySelector('.artist-name');
    songName.addEventListener('click', (e) => {
        e.stopPropagation();
        selectTrack(track);
    });
    artistName.addEventListener('click', (e) => {
        e.stopPropagation();
        selectTrack(track);
    });

    return recommendationItem;
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        if (currentPlayingItem) {
            currentPlayingItem.classList.remove('playing');
            anime({
                targets: currentPlayingItem,
                scale: 1,
                duration: 300,
                easing: 'easeOutQuad'
            });
        }
        currentAudio = null;
        currentPlayingItem = null;
    }
}

async function getAudioFeatures(trackId) {
    const result = await axios.get(`https://api.spotify.com/v1/audio-features/${trackId}`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    return result.data;
}

function debounce(func, delay) {
    let debounceTimer;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    }
}

function resetZoom() {
    document.body.style.zoom = "70%";
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await fetchConfig();
        await getAccessToken();

        document.querySelector('main').style.display = 'none';

        const debounceSearch = debounce(search, 300);
        document.getElementById('searchInput').addEventListener('input', debounceSearch);

        document.addEventListener('click', function(event) {
            const searchResults = document.querySelector('.search-results');
            const searchInput = document.getElementById('searchInput');
            if (searchResults && event.target !== searchInput && !searchResults.contains(event.target)) {
                anime({
                    targets: searchResults,
                    opacity: 0,
                    translateY: -10,
                    duration: 300,
                    easing: 'easeOutQuad',
                    complete: () => {
                        searchResults.style.display = 'none';
                    }
                });
            }
        });

        anime.timeline({
            easing: 'easeOutQuad',
            duration: 1000
        }).add({
            targets: '.site-title',
            opacity: [0, 1],
            translateY: [-30, 0],
            rotate: ['5deg', '0deg'],
            delay: 200
        }).add({
            targets: '.search-container',
            opacity: [0, 1],
            translateY: [-20, 0],
            duration: 800
        }, '-=400');

        resetZoom();
    } catch (error) {
        console.error('Error initializing application:', error);
        // You might want to display an error message to the user here
    }
});

function handleRecommendationPlay(item, track) {
    const audio = item.querySelector('audio');

    if (!audio) {
        console.log('No preview available for:', track.name);
        return;
    }

    if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
        currentPlayingItem.classList.remove('playing');
    }

    if (audio.paused) {
        audio.play();
        item.classList.add('playing');
        currentAudio = audio;
        currentPlayingItem = item;
    } else {
        audio.pause();
        item.classList.remove('playing');
        currentAudio = null;
        currentPlayingItem = null;
    }
}