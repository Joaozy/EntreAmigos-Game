const shuffle = (array) => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

const getRandomItem = (array) => {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
};

const generateDeck = (size = 100) => {
    const deck = Array.from({ length: size }, (_, i) => i + 1);
    return shuffle(deck);
};

const normalize = (str) => {
    if(!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

module.exports = { shuffle, getRandomItem, generateDeck, normalize };