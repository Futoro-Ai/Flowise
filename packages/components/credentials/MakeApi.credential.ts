import { INodeParams, INodeCredential } from '../src/Interface'

class MakeApi implements INodeCredential {
    label: string
    name: string
    version: number
    inputs: INodeParams[]

    constructor() {
        this.label = 'Make API'
        this.name = 'makeApi'
        this.version = 1.0
        this.inputs = [
            {
                label: 'Make Zone',
                name: 'makeZone',
                type: 'options',
                options: [
                    { label: 'US1', name: 'us1' },
                    { label: 'EU1', name: 'eu1' },
                    { label: 'EU2', name: 'eu2' },
                    { label: 'AP1', name: 'ap1' },
                    { label: 'AP2', name: 'ap2' },
                    { label: 'SA1', name: 'sa1' },
                    { label: 'CA1', name: 'ca1' },
                    { label: 'AU1', name: 'au1' }
                ],
                default: 'us1',
                description: 'Select the zone your Make account is hosted in.'
            },
            {
                label: 'Make MCP Token',
                name: 'mcpToken',
                type: 'password',
                description: 'Your Make MCP Token. Refer to Make documentation for generating this token.',
                placeholder: 'Paste your Make MCP Token here'
            }
        ]
    }
}

module.exports = { credClass: MakeApi }