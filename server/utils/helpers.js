const shuffle = (array) => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

const generateDeck = () => {
    const deck = Array.from({ length: 100 }, (_, i) => i + 1);
    return shuffle(deck);
};

const normalize = (str) => {
    if(!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

module.exports = { shuffle, generateDeck, normalize };