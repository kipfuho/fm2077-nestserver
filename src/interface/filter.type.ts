export class FilterOptions {
	// id of prefix
	prefix: string[];

	// id of user made the thread
	author: string;

	// thread update, first message update
	last_update_within: Date;

	// sort options
	sort_type: string;

	descending: boolean;
}