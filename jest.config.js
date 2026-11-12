export default {
    testEnvironment: 'node',
    roots: ['<rootDir>/api/src'],
    extensionsToTreatAsEsm: ['.ts'],
    transform: {
        '^.+\\.ts$': '<rootDir>/jest.transform.cjs',
    },
};
