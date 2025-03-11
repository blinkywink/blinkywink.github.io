// Custom Cursor
document.addEventListener('DOMContentLoaded', function() {
  // Create cursor elements
  const cursorContainer = document.createElement('div');
  cursorContainer.className = 'custom-cursor';
  
  const cursorX = document.createElement('div');
  cursorX.className = 'x-cursor';
  
  cursorContainer.appendChild(cursorX);
  document.body.appendChild(cursorContainer);
  
  document.addEventListener('mousemove', (e) => {
    cursorX.style.left = e.clientX + 'px';
    cursorX.style.top = e.clientY + 'px';
  });

  document.addEventListener('mouseleave', () => {
    cursorContainer.style.opacity = '0';
  });

  document.addEventListener('mouseenter', () => {
    cursorContainer.style.opacity = '1';
  });
}); 