import {
	IExecuteFunctions,
	IRequestOptions,
	IHttpRequestMethods,
	NodeOperationError,
} from 'n8n-workflow';
import { evolutionRequest } from '../evolutionRequest';

export async function sendList(this: IExecuteFunctions) {
	try {
		// Lê todos os itens de entrada do node
		const items = this.getInputData();

		// Lê parâmetros principais (do primeiro item)
		const instanceName = this.getNodeParameter('instanceName', 0) as string;
		const remoteJid = this.getNodeParameter('remoteJid', 0) as string;
		const title = this.getNodeParameter('title', 0) as string;
		const description = this.getNodeParameter('description', 0) as string;
		const buttonText = this.getNodeParameter('buttonText', 0) as string;

		/**
		 * Lê o parâmetro que habilita/desabilita a criação automática de rows.
		 * Exemplo: checkbox "Habilitar criação automática de itens?" -> `enableAutoRows`
		 * Lê também um "sectionTitle" que o usuário define quando `enableAutoRows` for true.
		 */
		const enableAutoRows = this.getNodeParameter('enableAutoRows', 0, false) as boolean;
		const dynamicSectionTitle = this.getNodeParameter('dynamicSectionTitle', 0, '') as string;

		/**
		 * Parâmetro "sections" que já existia na configuração anterior,
		 * pois se o usuário NÃO habilitar o modo automático, iremos usar essas sections
		 */
		const manualSections = this.getNodeParameter('sections.sectionValues', 0, []) as {
			title: string;
			rows: {
				rowValues: {
					title: string;
					description?: string;
					rowId?: string;
				}[];
			};
		}[];

		// Opções adicionais (footer, delay, quoted, mentions etc.)
		const options = this.getNodeParameter('options_message', 0, {}) as {
			footer?: string;
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

		/**
		 * Aqui vem a lógica condicional:
		 * - Se o usuário não habilitou o modo automático (enableAutoRows === false),
		 *   usa as seções manuais (manualSections) que já existiam antes.
		 * - Se o usuário habilitou o modo automático, gera as rows dinamicamente.
		 */
		let sectionsToUse: any[] = []; // array que iremos atribuir ao body.sections

		if (!enableAutoRows) {
			//
			// ===== LÓGICA TRADICIONAL (MODO ANTIGO) =====
			//
			if (!Array.isArray(manualSections) || manualSections.length === 0) {
				// Se o usuário não preencheu a sections manual, retorna erro ou algo do tipo
				const errorData = {
					success: false,
					error: {
						message: 'Lista de seções inválida',
						details: 'É necessário fornecer pelo menos uma seção com opções',
						code: 'INVALID_SECTIONS',
						timestamp: new Date().toISOString(),
					},
				};
				return {
					json: errorData,
					error: errorData,
				};
			}

			sectionsToUse = manualSections.map((section) => ({
				title: section.title,
				rows: section.rows.rowValues.map((row) => ({
					title: row.title,
					description: row.description || '',
					rowId: row.rowId || `${section.title}_${row.title}`,
				})),
			}));

		} else {
			//
			// ===== NOVA LÓGICA (MODO AUTOMÁTICO) =====
			//
			// Gera uma única seção (ou mais, se você quiser) com base nos items
			const rowsFromItems = items.map((item, index) => {
				// Exemplo: o usuário poderia inserir no item.json { "rowTitle": "Foo", "rowDescription": "Bar" }
				return {
					title: item.json?.rowTitle ?? `Item ${index + 1}`,
					description: item.json?.rowDescription ?? '',
					rowId: item.json?.rowId ?? `row_${index + 1}`,
				};
			});

			// "dynamicSectionTitle" é preenchido pelo usuário quando enableAutoRows=true
			if (!dynamicSectionTitle) {
				throw new NodeOperationError(
					this.getNode(),
					'É necessário preencher um título para a seção em modo automático.'
				);
			}

			sectionsToUse = [
				{
					title: dynamicSectionTitle,
					rows: rowsFromItems,
				},
			];
		}

		// Monta o body da request
		const body: any = {
			number: remoteJid,
			title,
			description,
			buttonText,
			footerText: options.footer || '',
			sections: sectionsToUse,
		};

		if (options.delay) {
			body.delay = options.delay;
		}

		if (options.quoted?.messageQuoted?.messageId) {
			body.quoted = {
				key: {
					id: options.quoted.messageQuoted.messageId,
				},
			};
		}

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

		const requestOptions: IRequestOptions = {
			method: 'POST' as IHttpRequestMethods,
			headers: {
				'Content-Type': 'application/json',
			},
			uri: `/message/sendList/${instanceName}`,
			body,
			json: true,
		};

		// Dispara a requisição
		const response = await evolutionRequest(this, requestOptions);

		// Retorna o resultado para cada item (ou só 1, a seu critério)
		return this.prepareOutputData(
			items.map(() => ({
				json: {
					success: true,
					data: response,
				},
			}))
		);

	} catch (error) {
		const errorData = {
			success: false,
			error: {
				message: error.message.includes('Could not get parameter')
					? 'Parâmetros inválidos ou ausentes'
					: 'Erro ao enviar lista',
				details: error.message.includes('Could not get parameter')
					? 'Verifique se todos os campos obrigatórios foram preenchidos corretamente'
					: error.message,
				code: error.code || 'UNKNOWN_ERROR',
				timestamp: new Date().toISOString(),
			},
		};

		if (!this.continueOnFail()) {
			throw new NodeOperationError(this.getNode(), error.message, {
				message: errorData.error.message,
				description: errorData.error.details,
			});
		}

		return this.prepareOutputData(
			this.getInputData().map(() => ({
				json: errorData,
			}))
		);
	}
}
