const leftOfHTML = `<ytmusic-setting-boolean-renderer class="style-scope ytmusic-setting-category-collection-renderer">
	<div class="content style-scope ytmusic-setting-boolean-renderer" for="">
		<yt-formatted-string id="left-of-label" class="title style-scope ytmusic-setting-boolean-renderer"></yt-formatted-string>
		<toggle-button class="toggle style-scope ytmusic-setting-boolean-renderer" role="button" aria-pressed="true" tabindex="0" toggles="" aria-disabled="false" checked="" active="" style="touch-action: pan-y;">
			<div class="toggle-container style-scope paper-toggle-button">
				<div id="toggleBar" class="toggle-bar style-scope paper-toggle-button"></div>
				<div id="toggleButton" class="toggle-button style-scope paper-toggle-button"></div>
			</div>
			<div class="toggle-label style-scope paper-toggle-button"></div>
		</toggle-button>
	</div>

	<yt-formatted-string id="left-of-description" class="summary style-scope ytmusic-setting-boolean-renderer"></yt-formatted-string>
</ytmusic-setting-boolean-renderer>`;

const descriptionHTML = `<yt-formatted-string id="left-of-description" class="summary style-scope ytmusic-setting-boolean-renderer"></yt-formatted-string>`;

window.addEventListener('iron-overlay-opened', () => {
	const listBox = document.querySelector('#content > ytmusic-settings-page > div.content.style-scope.ytmusic-settings-page > paper-listbox');
	
	if (!listBox) return;

	const generalButton = listBox.querySelector('#content > ytmusic-settings-page > div.content.style-scope.ytmusic-settings-page > paper-listbox > paper-item:nth-child(1)');
	//console.log(generalButton.querySelector('yt-formatted-string').innerText);

	if (generalButton.querySelector('yt-formatted-string').innerText != 'General') return;

	injectEl();

	generalButton.addEventListener('focus', (...args) => {
		//console.log(args);

		//console.log(args[0].__relatedTarget == null)

		if (args[0].__relatedTarget == null) return;

		//console.log('reinjecting');

		setTimeout(injectEl, 200);
	})

	//console.log('settings opened')
});

function injectEl() {
	let tempElement = document.createElement('div');
	tempElement.innerHTML = leftOfHTML.trim();

	//console.log(tempElement.firstChild)

	document.querySelector('#content > ytmusic-settings-page > div.content.style-scope.ytmusic-settings-page > ytmusic-setting-category-collection-renderer > div').appendChild(tempElement.firstChild);

	const leftOfOption = document.querySelector('#content > ytmusic-settings-page > div.content.style-scope.ytmusic-settings-page > ytmusic-setting-category-collection-renderer > div > ytmusic-setting-boolean-renderer:nth-child(3)');
	leftOfOption.querySelector('iron-label > yt-formatted-string').innerText = 'Continue where you left of';

	tempElement.innerHTML = descriptionHTML.trim();

	leftOfOption.insertBefore(tempElement.firstChild, leftOfOption.lastChild);
	leftOfOption.querySelector('#left-of-description').innerText = 'YouTube Music Client will continue where you left of while jamming to your favorite tracks.';
	
	const continueState = window.ipcRenderer.sendSync('get-left-of-checked', null);
	const continueToggle = leftOfOption.querySelector('iron-label > paper-toggle-button');

	continueToggle.addEventListener('click', () => {
		window.ipcRenderer.sendSync('left-of-checked', continueToggle.checked);
	});
	
	continueToggle.checked = continueState;
}