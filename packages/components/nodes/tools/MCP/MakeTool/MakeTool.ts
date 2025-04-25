import { INode, INodeData, INodeParams, INodeOptionsValue, INodeCredential } from '../../../../src/Interface'; // Adjust path if needed
// Dynamically import SSEMCPToolkit inside methods
// import { SSEMCPToolkit } from '../sseCore';
import { getCredentialData } from '../../../../src/utils'; // Adjust path if needed
import { DynamicStructuredTool, Tool } from '@langchain/core/tools'; // Import Tool instead of BaseTool
// Remove the old Tool import if no longer needed, or keep if baseClasses requires it
// import { Tool } from '@langchain/core/tools';

class MakeTool implements INode {
    label: string;
    name: string;
    version: number;
    description: string;
    type: string;
    icon: string;
    category: string;
    baseClasses: string[];
    inputs: INodeParams[];
    // Remove the old credential property if it exists
    // credential: INodeCredential | undefined;
    credential: INodeParams; // Define credential as a top-level property

    constructor() {
        this.label = 'Make.com Tool';
        this.name = 'makeTool';
        this.version = 1.0;
        this.description = 'Connects to Make.com MCP server and exposes scenarios as tools.';
        this.type = 'MakeTool'; // Consistent type name
        this.icon = 'MakeTool.png'; // Reference the icon file
        this.category = 'Tools (MCP)';
        this.baseClasses = ['Tool']; // Only include 'Tool', matching GithubMCP

        // Define the credential property separately
        this.credential = {
            label: 'Make.com Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['makeApi'] // Matches the name in MakeApi.credential.ts
        };

        // Define other inputs in the inputs array
        this.inputs = [
            {
                label: 'Available Scenarios',
                name: 'mcpActions',
                type: 'asyncMultiOptions',
                loadMethod: 'listMakeScenarios', // Method to populate options
                refresh: true // Add refresh button in UI
            }
        ];
    }

    // Method to dynamically load scenario options for the dropdown
    loadMethods = {
        async listMakeScenarios(nodeData: INodeData, options: any): Promise<INodeOptionsValue[]> {
            const credentialName = 'makeApi'; // Hardcoded for this node
            const credentialData = await getCredentialData(nodeData.credential ?? '', options?.context);

            if (!credentialData?.makeZone || !credentialData?.mcpToken) {
                // Return an option indicating missing credentials if needed by UI
                return [{ label: 'Configure Make.com Credentials First', name: 'NO_CRED', description: 'Credential details missing.' }];
            }

            const makeZone = credentialData.makeZone as string;
            const mcpToken = credentialData.mcpToken as string;
            const sseUrl = `https://${makeZone}/mcp/api/v1/u/${mcpToken}/sse`;

            try {
                const { SSEMCPToolkit } = await import('../sseCore'); // Dynamic import
                const toolkit = new SSEMCPToolkit({ url: sseUrl });
                await toolkit.initialize(); // Connect and fetch tools

                if (!toolkit.tools || toolkit.tools.length === 0) {
                    return [{ label: 'No Scenarios Found', name: 'NO_SCENARIOS', description: 'Check Make.com MCP server or token.' }];
                }

                // Format tools for the dropdown
                const scenarios = toolkit.tools.map((tool: DynamicStructuredTool) => ({ // Use correct type
                    label: tool.name, // Or a more descriptive label if available
                    name: tool.name,
                    description: tool.description || tool.name
                }));
                scenarios.sort((a, b) => a.label.localeCompare(b.label)); // Sort alphabetically
                return scenarios;

            } catch (error) {
                console.error("Error listing Make scenarios:", error);
                // Provide feedback in the dropdown
                const errorMessage = error instanceof Error ? error.message : String(error);
                return [{ label: 'Error Loading Scenarios', name: 'LOAD_ERROR', description: errorMessage.substring(0, 100) }]; // Truncate long errors
            }
        }
    };

    // Initialize the node and return the selected Langchain tools
    async init(nodeData: INodeData, _: string, options: any): Promise<DynamicStructuredTool[]> { // Update return type
        const credentialName = 'makeApi';
        const credentialData = await getCredentialData(nodeData.credential ?? '', options?.context);

        if (!credentialData?.makeZone || !credentialData?.mcpToken) {
            throw new Error('Make.com credentials are not configured for this node.');
        }

        const makeZone = credentialData.makeZone as string;
        const mcpToken = credentialData.mcpToken as string;
        const sseUrl = `https://${makeZone}/mcp/api/v1/u/${mcpToken}/sse`;

        // Get the names of the scenarios selected by the user in the UI
        const selectedActions = nodeData.inputs?.mcpActions as string[] || [];
        if (!Array.isArray(selectedActions) || selectedActions.length === 0) {
            // If no actions are selected, return an empty array or handle as needed
            return [];
        }

        try {
            const { SSEMCPToolkit } = await import('../sseCore'); // Dynamic import
            const toolkit = new SSEMCPToolkit({ url: sseUrl });
            await toolkit.initialize(); // Connect and fetch all available tools

            // Filter the fetched tools based on the user's selection
            const selectedTools = toolkit.tools.filter((tool: DynamicStructuredTool) => selectedActions.includes(tool.name)); // Use correct type

            return selectedTools;

        } catch (error) {
            console.error("Error initializing MakeTool:", error);
            throw new Error(`Failed to initialize MakeTool: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

module.exports = { nodeClass: MakeTool };