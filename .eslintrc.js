module.exports = {
    "env": {
        "es6": true,
        "node": true,
        "jest": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 2017
    },
    "rules": {
        "no-unused-vars": "warn",
        "no-undef": "warn",
        "no-redeclare": "warn",
        "no-extra-semi": "warn",
        "no-console": "off",
        "semi-style":
            [
                "error",
                "last"
            ]
    }
}
;
