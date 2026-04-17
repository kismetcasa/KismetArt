export const FACTORY_ADDRESS = '0x6832A997D8616707C7b68721D6E9332E77da7F6C' as const

export const FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'newContractURI', type: 'string' },
      { internalType: 'string', name: 'name', type: 'string' },
      {
        components: [
          { internalType: 'uint32', name: 'royaltyMintSchedule', type: 'uint32' },
          { internalType: 'uint32', name: 'royaltyBPS', type: 'uint32' },
          { internalType: 'address', name: 'royaltyRecipient', type: 'address' },
        ],
        internalType: 'struct ICreatorRoyaltiesControl.RoyaltyConfiguration',
        name: 'defaultRoyaltyConfiguration',
        type: 'tuple',
      },
      { internalType: 'address payable', name: 'defaultAdmin', type: 'address' },
      { internalType: 'bytes[]', name: 'setupActions', type: 'bytes[]' },
    ],
    name: 'createContract',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'newContract', type: 'address' },
      { indexed: true, internalType: 'address', name: 'creator', type: 'address' },
      { indexed: true, internalType: 'address', name: 'defaultAdmin', type: 'address' },
      { indexed: false, internalType: 'string', name: 'contractURI', type: 'string' },
      { indexed: false, internalType: 'string', name: 'name', type: 'string' },
      {
        components: [
          { internalType: 'uint32', name: 'royaltyMintSchedule', type: 'uint32' },
          { internalType: 'uint32', name: 'royaltyBPS', type: 'uint32' },
          { internalType: 'address', name: 'royaltyRecipient', type: 'address' },
        ],
        indexed: false,
        internalType: 'struct ICreatorRoyaltiesControl.RoyaltyConfiguration',
        name: 'defaultRoyaltyConfiguration',
        type: 'tuple',
      },
    ],
    name: 'SetupNewContract',
    type: 'event',
  },
] as const
