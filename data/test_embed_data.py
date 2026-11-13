import unittest

import numpy as np
from tokenizers import Tokenizer, models, pre_tokenizers, processors

import embed_data


class EmbedDataTests(unittest.TestCase):
    def make_word_tokenizer(self):
        tokenizer = Tokenizer(
            models.WordLevel(
                {"[UNK]": 0, "<s>": 1, "</s>": 2, "passage": 3, ":": 4},
                unk_token="[UNK]",
            )
        )
        tokenizer.pre_tokenizer = pre_tokenizers.Whitespace()
        tokenizer.post_processor = processors.TemplateProcessing(
            single="<s> $A </s>",
            pair="<s> $A $B:1 </s>",
            special_tokens=[("<s>", 1), ("</s>", 2)],
        )
        return tokenizer

    def test_masked_mean_ignores_padding_before_normalization(self):
        hidden = np.array([[[2, 1], [4, 3], [100, 100]]], dtype=np.float32)
        pooled = embed_data.pool_masked_mean(hidden, np.array([[1, 1, 0]]))
        np.testing.assert_allclose(pooled, [[3, 2]])
        normalized = embed_data.normalize_embeddings(pooled, 2)
        np.testing.assert_allclose(normalized, [[3 / np.sqrt(13), 2 / np.sqrt(13)]])

    def test_normalization_rejects_invalid_vectors(self):
        for vectors, dimensions in (
            ([[0, 0]], 2),
            ([[float("nan"), 1]], 2),
            ([[1, 2]], 3),
        ):
            with self.subTest(vectors=vectors, dimensions=dimensions):
                with self.assertRaises(ValueError):
                    embed_data.normalize_embeddings(vectors, dimensions)

    def test_validation_rejects_duplicate_ids_and_bad_references(self):
        valid_field = {
            "id": "field-a", "name": "A", "summary": "A", "misconception": "A",
            "terms": [{"term": f"t{i}", "description": "d"} for i in range(4)],
        }
        valid_researcher = {
            "id": "researcher-a", "name": "A", "affiliation": "A",
            "kaken_url": "url", "theme": "theme", "projects": [],
        }
        with self.assertRaisesRegex(ValueError, "duplicate field ID"):
            embed_data.validate_inputs(
                [valid_field, valid_field], [valid_researcher], []
            )
        with self.assertRaisesRegex(ValueError, "unknown researcher or field"):
            embed_data.validate_inputs(
                [valid_field], [valid_researcher],
                [{"researcher_id": "researcher-a", "field_id": "missing"}],
            )

    def test_project_chunks_preserve_text_and_stay_within_512_tokens(self):
        tokenizer = self.make_word_tokenizer()
        source = ("研究内容a " * 1200) + "最後"
        chunks = embed_data.split_text(source, tokenizer, "passage: ", 512)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(chunks))
        self.assertTrue(all(any(character.isalnum() for character in chunk) for chunk in chunks))
        self.assertEqual("".join(chunks), source)
        for chunk in chunks:
            self.assertLessEqual(
                len(tokenizer.encode("passage: " + chunk, add_special_tokens=True).ids), 512
            )

    def test_trailing_period_stays_with_meaningful_text(self):
        tokenizer = self.make_word_tokenizer()
        source = ("word " * 508) + "。"

        chunks = embed_data.split_text(source, tokenizer, "passage: ", 512)

        self.assertEqual("".join(chunks), source)
        self.assertTrue(chunks[-1].endswith("。"))
        self.assertTrue(any(character.isalnum() for character in chunks[-1]))
        self.assertTrue(all(any(character.isalnum() for character in chunk) for chunk in chunks))
        self.assertTrue(all(
            len(tokenizer.encode("passage: " + chunk, add_special_tokens=True).ids) <= 512
            for chunk in chunks
        ))

        last_sentence = ("final " * 39) + "sentence."
        source = ("word " * 465) + "Previous sentence. " + last_sentence
        chunks = embed_data.split_text(source, tokenizer, "passage: ", 512)
        self.assertEqual(chunks[-1], " " + last_sentence)
        self.assertEqual("".join(chunks), source)

    def test_symbol_only_project_text_is_rejected_but_short_text_is_kept(self):
        tokenizer = self.make_word_tokenizer()
        with self.assertRaisesRegex(ValueError, "letter or digit"):
            embed_data.split_text(" 。!? ", tokenizer, "passage: ", 512)
        for source in ("English", "研究", "2026"):
            with self.subTest(source=source):
                self.assertEqual(embed_data.split_text(source, tokenizer, "passage: ", 512), [source])

    def test_project_text_is_reused_by_id_and_conflicts_are_rejected(self):
        project = {
            "id": "p1", "title": "Title", "keywords": ["keyword"], "abstract": "Abstract",
        }
        researchers = [
            {"id": "r1", "projects": [project]},
            {"id": "r2", "projects": [project.copy()]},
        ]
        text_by_id, projects_by_researcher = embed_data.build_project_texts(researchers)
        self.assertEqual(list(text_by_id), ["p1"])
        self.assertEqual(projects_by_researcher, {"r1": ["p1"], "r2": ["p1"]})

        conflicting = project | {"abstract": "Different abstract"}
        with self.assertRaisesRegex(ValueError, "conflicting source text"):
            embed_data.build_project_texts(
                [researchers[0], {"id": "r2", "projects": [conflicting]}]
            )

    def test_overlong_non_project_inputs_fail_instead_of_truncating(self):
        class UnusedSession:
            def get_inputs(self):
                return [type("Input", (), {"name": name})() for name in ("input_ids", "attention_mask")]

            def get_outputs(self):
                return [type("Output", (), {"name": "last_hidden_state"})()]

            def run(self, *_args):
                raise AssertionError("overlong inputs must fail before ONNX execution")

        tokenizer = self.make_word_tokenizer()
        source = " ".join(["word"] * 600)
        with self.assertRaisesRegex(ValueError, "inputs exceed 512 tokens"):
            embed_data._encode_texts(
                [source], "terms", "passage: ", tokenizer, UnusedSession(), 512, 384,
                "[UNK]", 0, "right",
            )


if __name__ == "__main__":
    unittest.main()
