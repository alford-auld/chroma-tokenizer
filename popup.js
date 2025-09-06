// Popup script for the Text Token Colorizer extension

document.addEventListener('DOMContentLoaded', async () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const status = document.getElementById('status');
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Check current status
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
    updateUI(response.active);
  } catch (error) {
    console.error('Error getting status:', error);
    // Show helpful message instead of generic error
    status.textContent = 'Please refresh the page to use the extension';
    status.className = 'status inactive';
  }
  
  // Toggle switch event listener
  toggleSwitch.addEventListener('click', async () => {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
      updateUI(response.active);
    } catch (error) {
      console.error('Error toggling:', error);
      status.textContent = 'Please refresh the page to use the extension';
      status.className = 'status inactive';
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
});
