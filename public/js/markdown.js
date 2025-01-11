const markdownProcessor = {
    process(text) {
        text = this.processEmbeds(text);
        marked.setOptions({
            breaks: true,
            gfm: true
        });
        return marked.parse(text);
    },

    processEmbeds(text) {
        return text.replace(/@\[(.*?)\]/g, (match, content) => {
            switch(content.toLowerCase()) {
                case 'public':
                    return `<a href="/public" class="embed-link">Public Files</a>`;
                default:
                    return match;
            }
        });
    },

    sanitize(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

export default markdownProcessor;
