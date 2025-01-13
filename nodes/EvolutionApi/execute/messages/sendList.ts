import {
	IExecuteFunctions,
	IRequestOptions,
	IHttpRequestMethods,
	NodeOperationError,
} from 'n8n-workflow';
import { evolutionRequest } from '../evolutionRequest';

export async function sendList(this: IExecuteFunctions) {
		// Todos os items que chegam ao Node
		const items = this.getInputData();

		// Parâmetros básicos
		const instanceName = this.getNodeParameter('instanceName', 0) as string;
		const remoteJid = this.getNodeParameter('remoteJid', 0) as string;
		const title = this.getNodeParameter('title', 0) as string;
		const description = this.getNodeParameter('description', 0) as string;
		const buttonText = this.getNodeParameter('buttonText', 0) as string;
		const footerText = this.getNodeParameter('footerText', 0) as string;

		// Flag: modo automático ou manual?
		const enableAutoRows = this.getNodeParameter('enableAutoRows', 0, false) as boolean;

		// Opções adicionais (delay, mentions etc.)
		const options = this.getNodeParameter('options_message', 0, {}) as {
			delay?: number;
			quoted?: {
				messageQuoted: {
					messageId: string;
				};
			};
			mentions?: {
				mentionsSettings: {
					mentionsEveryOne: boolean;
					mentioned?: string;
				};
			};
		};

		// Array final de seções
		let finalSections: Array<{ title: string; rows: any[] }> = [];

		// ------------------------------------------------------
		// MODO AUTOMÁTICO
		// ------------------------------------------------------
		if (enableAutoRows) {
			// Lê a coleção "sectionsAuto"
			const sectionsAuto = this.getNodeParameter('sectionsAuto.sectionValuesAuto', 0, []) as Array<{
				titleAuto?: string;
				rows?: {
					rowValuesAuto?: Array<{
						rowTitleExp?: string;
						rowDescriptionExp?: string;
						rowIdExp?: string;
					}>;
				};
			}>;

			if (!sectionsAuto.length) {
				throw new NodeOperationError(
					this.getNode(),
					'Parâmetros inválidos ou ausentes: Nenhuma seção automática preenchida.'
				);
			}

			// Pegamos a primeira "seção automática" (ou, se quiser permitir várias, faria outro loop)
			const firstSection = sectionsAuto[0];
			const sectionTitle = firstSection.titleAuto || 'Seção Automática';

			// Pega o array de rowValuesAuto (pode estar em firstSection.rows)
			const rowValuesAuto = firstSection.rows?.rowValuesAuto ?? [];
			if (!rowValuesAuto.length) {
				// Se o usuário não adicionou "Linhas (Automático)" no editor
				throw new NodeOperationError(
					this.getNode(),
					'Parâmetros inválidos ou ausentes: Você deve adicionar ao menos uma configuração de linhas automáticas.'
				);
			}

			// Normalmente, rowValuesAuto[0] conteria as EXPRESSÕES (ex. "Produto: {{ $json.nome_produto }}")
			// Mas se você quer permitir que o usuário crie "n" blocos de expressão, 
			// teria de decidir como combiná-los. Aqui assumo que o nodeParameter do n8n 
			// substitui as expressões de cada item, ou que rowValuesAuto[0] é o template.
			const { rowTitleExp, rowDescriptionExp, rowIdExp } = rowValuesAuto[0];

			// Monta as rows a partir dos items do n8n
			const rows = items.map((item, index) => {
				// Se as expressões já foram interpoladas, rowTitleExp será uma string final.
				// Se não, você precisaria de "evaluateExpression" ou algo similar do n8n.
				const titleFromItem = rowTitleExp || `Item ${index + 1}`;
				const descriptionFromItem = rowDescriptionExp || '';
				const idFromItem = rowIdExp || `autoRow_${index + 1}`;

				return {
					title: titleFromItem,
					description: descriptionFromItem,
					rowId: idFromItem,
				};
			});

			finalSections = [
				{
					title: sectionTitle,
					rows,
				},
			];

		} else {
			// ------------------------------------------------------
			// MODO MANUAL
			// ------------------------------------------------------
			const sectionsManual = this.getNodeParameter('sectionsManual.sectionValuesManual', 0, []) as Array<{
				title: string;
				rows?: {
					rowValuesManual?: Array<{
						title: string;
						description?: string;
						rowId?: string;
					}>;
				};
			}>;

			if (!sectionsManual.length) {
				throw new NodeOperationError(
					this.getNode(),
					'Parâmetros inválidos ou ausentes: Nenhuma seção manual preenchida.'
				);
			}

			// Constrói a(s) seção(ões) manual(is)
			finalSections = sectionsManual.map((section) => {
				const rowValuesManual = section.rows?.rowValuesManual ?? [];
				return {
					title: section.title || 'Seção Manual',
					rows: rowValuesManual.map((row) => ({
						title: row.title,
						description: row.description || '',
						rowId: row.rowId || `${section.title}_${row.title}`,
					})),
				};
			});
		}

		// ------------------------------------------------------
		// Monta o body final
		// ------------------------------------------------------
		const body: any = {
			number: remoteJid,
			title,
			description,
			buttonText,
			footerText,
			sections: finalSections,
		};

		// Delay
		if (options.delay) {
			body.delay = options.delay;
		}

		// Quoted message
		if (options.quoted?.messageQuoted?.messageId) {
			body.quoted = {
				key: {
					id: options.quoted.messageQuoted.messageId,
				},
			};
		}

		// Mentions
		if (options.mentions?.mentionsSettings) {
			const { mentionsEveryOne, mentioned } = options.mentions.mentionsSettings;
			if (mentionsEveryOne) {
				body.mentionsEveryOne = true;
			} else if (mentioned) {
				const mentionedNumbers = mentioned
					.split(',')
					.map((num) => num.trim())
					.map((num) => (num.includes('@s.whatsapp.net') ? num : `${num}@s.whatsapp.net`));
				body.mentioned = mentionedNumbers;
			}
		}

		// Opções de requisição
		const requestOptions: IRequestOptions = {
			method: 'POST' as IHttpRequestMethods,
			headers: { 'Content-Type': 'application/json' },
			uri: `/message/sendList/${instanceName}`,
			body,
			json: true,
		};

		// Dispara a request
		const response = await evolutionRequest(this, requestOptions);

		// Retorna UM item final com a resposta
		return [
			{
				json: {
					success: true,
					data: response,
				},
			},
		];
}
