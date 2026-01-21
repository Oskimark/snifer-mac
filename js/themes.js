function changeTheme(theme) {
    document.body.classList.remove('theme-claro', 'theme-mono');
    if (theme !== 'color') {
        document.body.classList.add(`theme-${theme}`);
    }
    localStorage.setItem('snifferTheme', theme);
    const selector = document.getElementById('themeSelector');
    if (selector) selector.value = theme;
}

function initTheme() {
    const savedTheme = localStorage.getItem('snifferTheme') || 'color';
    changeTheme(savedTheme);
}

// Automatically init theme when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
} else {
    initTheme();
}

// Function to inject the theme switcher into a container
function injectThemeSwitcher(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!document.getElementById('themeSelector')) {
        const select = document.createElement('select');
        select.id = 'themeSelector';
        select.className = 'theme-selector';
        select.onchange = (e) => changeTheme(e.target.value);

        const themes = [
            { value: 'color', label: '🎨 Color' },
            { value: 'claro', label: '🏁 Mono' },
            { value: 'mono', label: '☀️ Claro' }
        ];

        themes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.value;
            opt.innerText = t.label;
            select.appendChild(opt);
        });

        container.appendChild(select);

        // Ensure the selector shows the correct current theme
        const savedTheme = localStorage.getItem('snifferTheme') || 'color';
        select.value = savedTheme;
    }
}
