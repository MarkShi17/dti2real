import unittest
import numpy as np
from masks import choose_mask, prompt_boxes

class MaskSelectionTests(unittest.TestCase):
    def test_rejects_uncertain_predictions(self):
        masks=np.ones((1,100,100),dtype=bool)
        self.assertIsNone(choose_mask(masks,np.array([.3]),[20,20,70,80]))

    def test_rejects_background_leak_even_if_model_score_is_high(self):
        self.assertIsNone(choose_mask(np.ones((1,100,100),dtype=bool),np.array([.99]),[20,20,70,80]))

    def test_keeps_disconnected_shoes_and_removes_tiny_specks(self):
        m=np.zeros((100,100),dtype=bool)
        m[40:80,20:35]=True; m[40:80,50:70]=True; m[35,45]=True
        result=choose_mask(m[None],np.array([.91]),[15,30,75,85])
        mask,score=result
        self.assertEqual(int(mask.sum()),1400)
        self.assertFalse(mask[35,45]);self.assertAlmostEqual(score,.91)

    def test_rejects_empty_and_selects_valid_alternative(self):
        masks=np.zeros((2,100,100),dtype=bool);masks[1,20:60,25:65]=True
        mask,score=choose_mask(masks,np.array([.99,.8]),[20,15,70,65])
        self.assertEqual(int(mask.sum()),1600);self.assertAlmostEqual(score,.8)

    def test_uncertain_clothing_boxes_get_bounded_alternative_prompts(self):
        boxes=prompt_boxes([20,20,70,80],100,100,'top')
        self.assertEqual(len(boxes),9)
        self.assertEqual(boxes[0].tolist(),[20,20,70,80])
        for box in boxes:
            self.assertTrue(np.all(box>=0));self.assertTrue(np.all(box<=100))
        self.assertEqual(len(prompt_boxes([20,20,70,80],100,100,'jewelry')),1)

if __name__=='__main__':unittest.main()
