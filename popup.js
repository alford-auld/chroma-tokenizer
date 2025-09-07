// Popup script for the Text Token Colorizer extension

document.addEventListener('DOMContentLoaded', async () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const predictionBtn = document.getElementById('predictionBtn');
  const status = document.getElementById('status');
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
    updateUI(response.active);
  } catch (error) {
    status.textContent = 'Please refresh the page to use the extension';
    status.className = 'status inactive';
  }
  
  toggleSwitch.addEventListener('click', async () => {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
      updateUI(response.active);
    } catch (error) {
      status.textContent = 'Please refresh the page to use the extension';
      status.className = 'status inactive';
    }
  });
  
  predictionBtn.addEventListener('click', async () => {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'togglePredictionMode' });
      updatePredictionUI(response.predictionMode);
    } catch (error) {
      console.error('Error toggling prediction mode:', error);
    }
  });
  
  function updateUI(isActive) {
    if (isActive) {
      toggleSwitch.classList.add('active');
      status.textContent = 'Active - Text is being colorized';
      status.className = 'status active';
    } else {
      toggleSwitch.classList.remove('active');
      status.textContent = 'Inactive - Click to enable';
      status.className = 'status inactive';
    }
  }
  
  function updatePredictionUI(isActive) {
    if (isActive) {
      predictionBtn.textContent = 'Disable';
      predictionBtn.classList.add('active');
    } else {
      predictionBtn.textContent = 'Enable';
      predictionBtn.classList.remove('active');
    }
  }
});
